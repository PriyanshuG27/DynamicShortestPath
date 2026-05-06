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

std::string jsonDoubleBellman(double value) {
    if (!std::isfinite(value)) {
        return "null";
    }

    std::ostringstream out;
    out << std::setprecision(15) << value;
    return out.str();
}

std::string toJsonArrayBellman(const std::vector<double>& values) {
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << jsonDoubleBellman(values[i]);
    }
    out << "]";
    return out.str();
}

std::string toJsonArrayBellman(const std::vector<int>& values) {
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

int runStandardDijkstraRelaxationCount(const Graph& g, int source) {
    const std::size_t n = g.nodeCount();
    if (source < 0 || static_cast<std::size_t>(source) >= n) {
        return 0;
    }

    const double inf = std::numeric_limits<double>::infinity();
    std::vector<double> dist(n, inf);
    dist[static_cast<std::size_t>(source)] = 0.0;

    int relaxations = 0;
    MinHeap heap;
    heap.insert(source, 0.0);

    while (!heap.empty()) {
        const std::pair<int, double> minItem = heap.extractMin();
        const int u = minItem.first;
        const double bestKnown = minItem.second;

        if (bestKnown > dist[static_cast<std::size_t>(u)]) {
            continue;
        }

        const std::vector<int>& incidentEdges = g.getIncidentEdges(u);
        for (int edgeIdx : incidentEdges) {
            const Edge& edge = g.getEdge(edgeIdx);
            const int v = (edge.a == u) ? edge.b : edge.a;

            if (v < 0 || static_cast<std::size_t>(v) >= n) {
                continue;
            }

            const double candidate = dist[static_cast<std::size_t>(u)] + edge.weight;
            if (candidate < dist[static_cast<std::size_t>(v)]) {
                dist[static_cast<std::size_t>(v)] = candidate;
                ++relaxations;

                if (heap.contains(v)) {
                    heap.decreaseKey(v, candidate);
                } else {
                    heap.insert(v, candidate);
                }
            }
        }
    }

    return relaxations;
}

void printRelaxationComparison(int dijkstraRelaxations, int bellmanRelaxations) {
    const int larger = (dijkstraRelaxations > bellmanRelaxations)
                           ? dijkstraRelaxations
                           : bellmanRelaxations;

    std::string winner = "equal";
    if (dijkstraRelaxations < bellmanRelaxations) {
        winner = "dijkstra";
    } else if (bellmanRelaxations < dijkstraRelaxations) {
        winner = "bellman-ford";
    }

    if (larger == 0) {
        std::ostringstream json;
        json << "{";
        json << "\"type\":\"relaxation_comparison\",";
        json << "\"winner\":\"" << winner << "\",";
        json << "\"percent\":0.0,";
        json << "\"dijkstra\":" << dijkstraRelaxations << ",";
        json << "\"bellman\":" << bellmanRelaxations;
        json << "}";
        std::cout << json.str() << std::endl;
        return;
    }

    const int diff = (dijkstraRelaxations > bellmanRelaxations)
                         ? (dijkstraRelaxations - bellmanRelaxations)
                         : (bellmanRelaxations - dijkstraRelaxations);

    const double percent = (static_cast<double>(diff) * 100.0) / static_cast<double>(larger);

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"relaxation_comparison\",";
    json << "\"winner\":\"" << winner << "\",";
    json << "\"percent\":" << std::fixed << std::setprecision(2) << percent << ",";
    json << "\"dijkstra\":" << dijkstraRelaxations << ",";
    json << "\"bellman\":" << bellmanRelaxations;
    json << "}";
    std::cout << json.str() << std::endl;
}

}  // namespace

DijkstraResult runBellmanFord(Graph& g, int source) {
    const std::size_t n = g.nodeCount();
    const std::size_t m = g.edgeCount();
    const double inf = std::numeric_limits<double>::infinity();

    DijkstraResult result;
    result.dist.assign(n, inf);
    result.prev.assign(n, -1);
    result.relaxations = 0;
    result.timeMs = 0.0;

    bool negativeCycle = false;

    const auto started = std::chrono::high_resolution_clock::now();

    if (source >= 0 && static_cast<std::size_t>(source) < n) {
        result.dist[static_cast<std::size_t>(source)] = 0.0;

        if (n > 1) {
            for (std::size_t i = 0; i < n - 1; ++i) {
                bool changed = false;

                for (std::size_t edgeIdx = 0; edgeIdx < m; ++edgeIdx) {
                    const Edge& edge = g.getEdge(static_cast<int>(edgeIdx));
                    const int a = edge.a;
                    const int b = edge.b;
                    const double w = edge.weight;

                    if (a < 0 || b < 0 || static_cast<std::size_t>(a) >= n ||
                        static_cast<std::size_t>(b) >= n) {
                        continue;
                    }

                    if (result.dist[static_cast<std::size_t>(a)] != inf) {
                        const double candAB = result.dist[static_cast<std::size_t>(a)] + w;
                        if (candAB < result.dist[static_cast<std::size_t>(b)]) {
                            result.dist[static_cast<std::size_t>(b)] = candAB;
                            result.prev[static_cast<std::size_t>(b)] = a;
                            ++result.relaxations;
                            changed = true;
                        }
                    }

                    if (result.dist[static_cast<std::size_t>(b)] != inf) {
                        const double candBA = result.dist[static_cast<std::size_t>(b)] + w;
                        if (candBA < result.dist[static_cast<std::size_t>(a)]) {
                            result.dist[static_cast<std::size_t>(a)] = candBA;
                            result.prev[static_cast<std::size_t>(a)] = b;
                            ++result.relaxations;
                            changed = true;
                        }
                    }
                }

                if (!changed) {
                    break;
                }
            }
        }

        for (std::size_t edgeIdx = 0; edgeIdx < m; ++edgeIdx) {
            const Edge& edge = g.getEdge(static_cast<int>(edgeIdx));
            const int a = edge.a;
            const int b = edge.b;
            const double w = edge.weight;

            if (a < 0 || b < 0 || static_cast<std::size_t>(a) >= n ||
                static_cast<std::size_t>(b) >= n) {
                continue;
            }

            if (result.dist[static_cast<std::size_t>(a)] != inf &&
                result.dist[static_cast<std::size_t>(a)] + w < result.dist[static_cast<std::size_t>(b)]) {
                negativeCycle = true;
                break;
            }

            if (result.dist[static_cast<std::size_t>(b)] != inf &&
                result.dist[static_cast<std::size_t>(b)] + w < result.dist[static_cast<std::size_t>(a)]) {
                negativeCycle = true;
                break;
            }
        }
    }

    const auto ended = std::chrono::high_resolution_clock::now();
    result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"bellman_done\",";
    json << "\"source\":" << source << ",";
    json << "\"dist\":" << toJsonArrayBellman(result.dist) << ",";
    json << "\"prev\":" << toJsonArrayBellman(result.prev) << ",";
    json << "\"relaxations\":" << result.relaxations << ",";
    json << "\"timeMs\":" << jsonDoubleBellman(result.timeMs) << ",";
    json << "\"negativeCycle\":" << (negativeCycle ? "true" : "false");
    json << "}";

    std::cout << json.str() << std::endl;

    const int dijkstraRelaxations = runStandardDijkstraRelaxationCount(g, source);
    printRelaxationComparison(dijkstraRelaxations, result.relaxations);

    return result;
}
