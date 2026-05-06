#include "graph.h"
#include "heap.h"

#include <chrono>
#include <cmath>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
#include <vector>

#ifndef SHORTEST_PATH_DIJKSTRA_RESULT_DEFINED
#define SHORTEST_PATH_DIJKSTRA_RESULT_DEFINED
struct DijkstraResult {
    std::vector<double> dist;
    std::vector<int> prev;
    int relaxations;
    double timeMs;
};
#endif

namespace {

std::string jsonDouble(double value) {
    if (!std::isfinite(value)) {
        return "null";
    }

    std::ostringstream out;
    out << std::setprecision(15) << value;
    return out.str();
}

std::string toJsonArray(const std::vector<double>& values) {
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << jsonDouble(values[i]);
    }
    out << "]";
    return out.str();
}

std::string toJsonArray(const std::vector<int>& values) {
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << values[i];
    }
    out << "]";
    return out.str();
}

template <typename CostFn>
DijkstraResult runDijkstraInternal(Graph& g, int source, CostFn edgeCost) {
    const std::size_t n = g.nodeCount();
    const double inf = std::numeric_limits<double>::infinity();

    DijkstraResult result;
    result.dist.assign(n, inf);
    result.prev.assign(n, -1);
    result.relaxations = 0;
    result.timeMs = 0.0;

    std::vector<int> prevEdge(n, -1);

    const auto started = std::chrono::high_resolution_clock::now();

    if (source >= 0 && static_cast<std::size_t>(source) < n) {
        MinHeap heap;
        result.dist[source] = 0.0;
        heap.insert(source, 0.0);

        while (!heap.empty()) {
            const std::pair<int, double> minItem = heap.extractMin();
            const int u = minItem.first;
            const double bestKnown = minItem.second;

            if (bestKnown > result.dist[u]) {
                continue;
            }

            const std::vector<int>& incidentEdges = g.getIncidentEdges(u);
            for (int edgeIdx : incidentEdges) {
                const Edge& edge = g.getEdge(edgeIdx);
                const int v = (edge.a == u) ? edge.b : edge.a;

                if (v < 0 || static_cast<std::size_t>(v) >= n) {
                    continue;
                }

                const double w = edgeCost(edge);
                const double candidate = result.dist[u] + w;

                if (candidate < result.dist[v]) {
                    result.dist[v] = candidate;
                    result.prev[v] = u;
                    prevEdge[v] = edgeIdx;
                    ++result.relaxations;

                    if (heap.contains(v)) {
                        heap.decreaseKey(v, candidate);
                    } else {
                        heap.insert(v, candidate);
                    }
                }
            }
        }
    }

    g.clearSPTMarks();

    std::vector<int> sptEdges;
    sptEdges.reserve(n > 0 ? n - 1 : 0);

    std::vector<bool> seen(g.edgeCount(), false);
    for (std::size_t v = 0; v < n; ++v) {
        if (source >= 0 && static_cast<std::size_t>(source) == v) {
            continue;
        }

        const int edgeIdx = prevEdge[v];
        if (edgeIdx < 0 || static_cast<std::size_t>(edgeIdx) >= seen.size()) {
            continue;
        }

        if (!seen[edgeIdx]) {
            seen[edgeIdx] = true;
            g.getEdge(edgeIdx).inSPT = true;
            sptEdges.push_back(edgeIdx);
        }
    }

    const auto ended = std::chrono::high_resolution_clock::now();
    result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"dijkstra_done\",";
    json << "\"source\":" << source << ",";
    json << "\"dist\":" << toJsonArray(result.dist) << ",";
    json << "\"prev\":" << toJsonArray(result.prev) << ",";
    json << "\"relaxations\":" << result.relaxations << ",";
    json << "\"timeMs\":" << jsonDouble(result.timeMs) << ",";
    json << "\"sptEdges\":" << toJsonArray(sptEdges);
    json << "}";

    std::cout << json.str() << std::endl;

    return result;
}

}  // namespace

DijkstraResult runStandardDijkstra(Graph& g, int source) {
    return runDijkstraInternal(g, source, [](const Edge& edge) {
        return edge.weight;
    });
}

DijkstraResult runProbabilisticDijkstra(Graph& g, int source, double k) {
    return runDijkstraInternal(g, source, [k](const Edge& edge) {
        return edge.weight + k * edge.sigma;
    });
}
