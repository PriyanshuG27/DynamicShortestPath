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

struct SelectiveResult {
    bool recomputeSkipped;
    int nodesRecomputed;
    double timeMs;
    std::string affectedNodes;
};

namespace {

std::string sptJsonDouble(double value) {
    if (!std::isfinite(value)) {
        return "null";
    }

    std::ostringstream out;
    out << std::setprecision(15) << value;
    return out.str();
}

std::string sptJsonArray(const std::vector<double>& values) {
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < values.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << sptJsonDouble(values[i]);
    }
    out << "]";
    return out.str();
}

std::string sptJsonArray(const std::vector<int>& values) {
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

int otherEndpoint(const Edge& edge, int node) {
    return (edge.a == node) ? edge.b : edge.a;
}

void refreshSPTFlags(Graph& g, const std::vector<int>& prev, double k) {
    g.clearSPTMarks();

    const double inf = std::numeric_limits<double>::infinity();
    for (std::size_t node = 0; node < prev.size(); ++node) {
        const int parent = prev[node];
        if (parent < 0) {
            continue;
        }

        int chosenEdge = -1;
        double bestCost = inf;

        const std::vector<int>& incident = g.getIncidentEdges(static_cast<int>(node));
        for (int edgeIdx : incident) {
            const Edge& edge = g.getEdge(edgeIdx);
            const int neighbor = otherEndpoint(edge, static_cast<int>(node));
            if (neighbor != parent) {
                continue;
            }

            const double cost = edge.weight + k * edge.sigma;
            if (cost < bestCost) {
                bestCost = cost;
                chosenEdge = edgeIdx;
            }
        }

        if (chosenEdge >= 0) {
            g.getEdge(chosenEdge).inSPT = true;
        }
    }
}

}  // namespace

bool isEdgeInSPT(Graph& g, int edgeIdx, std::vector<int>& prev) {
    if (edgeIdx < 0 || static_cast<std::size_t>(edgeIdx) >= g.edgeCount()) {
        return false;
    }

    const Edge& edge = g.getEdge(edgeIdx);
    if (edge.a < 0 || edge.b < 0 ||
        static_cast<std::size_t>(edge.a) >= prev.size() ||
        static_cast<std::size_t>(edge.b) >= prev.size()) {
        return false;
    }

    return (prev[static_cast<std::size_t>(edge.a)] == edge.b) ||
           (prev[static_cast<std::size_t>(edge.b)] == edge.a);
}

SelectiveResult handleEdgeUpdate(
    Graph& g,
    int edgeIdx,
    double newWeight,
    double newSigma,
    std::vector<double>& dist,
    std::vector<int>& prev,
    double k) {
    const auto started = std::chrono::high_resolution_clock::now();

    SelectiveResult result;
    result.recomputeSkipped = true;
    result.nodesRecomputed = 0;
    result.timeMs = 0.0;
    result.affectedNodes = "[]";

    bool inSPT = isEdgeInSPT(g, edgeIdx, prev);

    if (!g.updateEdge(edgeIdx, newWeight, newSigma)) {
        const auto ended = std::chrono::high_resolution_clock::now();
        result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

        std::ostringstream json;
        json << "{";
        json << "\"type\":\"edge_update\",";
        json << "\"edgeIdx\":" << edgeIdx << ",";
        json << "\"newWeight\":" << sptJsonDouble(newWeight) << ",";
        json << "\"newSigma\":" << sptJsonDouble(newSigma) << ",";
        json << "\"inSPT\":false,";
        json << "\"recomputeSkipped\":true,";
        json << "\"nodesRecomputed\":0,";
        json << "\"affectedNodes\":[],";
        json << "\"dist\":" << sptJsonArray(dist) << ",";
        json << "\"prev\":" << sptJsonArray(prev) << ",";
        json << "\"timeMs\":" << sptJsonDouble(result.timeMs);
        json << "}";

        std::cout << json.str() << std::endl;
        return result;
    }

    if (!inSPT) {
        const auto ended = std::chrono::high_resolution_clock::now();
        result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

        std::ostringstream json;
        json << "{";
        json << "\"type\":\"edge_update\",";
        json << "\"edgeIdx\":" << edgeIdx << ",";
        json << "\"newWeight\":" << sptJsonDouble(newWeight) << ",";
        json << "\"newSigma\":" << sptJsonDouble(newSigma) << ",";
        json << "\"inSPT\":false,";
        json << "\"recomputeSkipped\":true,";
        json << "\"nodesRecomputed\":0,";
        json << "\"affectedNodes\":[],";
        json << "\"dist\":" << sptJsonArray(dist) << ",";
        json << "\"prev\":" << sptJsonArray(prev) << ",";
        json << "\"timeMs\":" << sptJsonDouble(result.timeMs);
        json << "}";

        std::cout << json.str() << std::endl;
        return result;
    }

    const std::size_t n = g.nodeCount();
    if (dist.size() != n) {
        dist.assign(n, std::numeric_limits<double>::infinity());
    }
    if (prev.size() != n) {
        prev.assign(n, -1);
    }

    const Edge& updatedEdge = g.getEdge(edgeIdx);
    int subtreeRoot = -1;
    if (updatedEdge.a >= 0 && static_cast<std::size_t>(updatedEdge.a) < prev.size() &&
        prev[static_cast<std::size_t>(updatedEdge.a)] == updatedEdge.b) {
        subtreeRoot = updatedEdge.a;
    } else if (updatedEdge.b >= 0 && static_cast<std::size_t>(updatedEdge.b) < prev.size() &&
               prev[static_cast<std::size_t>(updatedEdge.b)] == updatedEdge.a) {
        subtreeRoot = updatedEdge.b;
    }

    if (subtreeRoot < 0) {
        const auto ended = std::chrono::high_resolution_clock::now();
        result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

        std::ostringstream json;
        json << "{";
        json << "\"type\":\"edge_update\",";
        json << "\"edgeIdx\":" << edgeIdx << ",";
        json << "\"newWeight\":" << sptJsonDouble(newWeight) << ",";
        json << "\"newSigma\":" << sptJsonDouble(newSigma) << ",";
        json << "\"inSPT\":true,";
        json << "\"recomputeSkipped\":true,";
        json << "\"nodesRecomputed\":0,";
        json << "\"affectedNodes\":[],";
        json << "\"dist\":" << sptJsonArray(dist) << ",";
        json << "\"prev\":" << sptJsonArray(prev) << ",";
        json << "\"timeMs\":" << sptJsonDouble(result.timeMs);
        json << "}";

        std::cout << json.str() << std::endl;
        return result;
    }

    std::vector<std::vector<int>> children(n);
    for (std::size_t node = 0; node < n; ++node) {
        const int parent = prev[node];
        if (parent >= 0 && static_cast<std::size_t>(parent) < n) {
            children[static_cast<std::size_t>(parent)].push_back(static_cast<int>(node));
        }
    }

    std::vector<bool> affected(n, false);
    std::vector<int> affectedNodesVec;
    std::vector<int> stack;
    stack.push_back(subtreeRoot);

    while (!stack.empty()) {
        const int u = stack.back();
        stack.pop_back();

        if (affected[static_cast<std::size_t>(u)]) {
            continue;
        }

        affected[static_cast<std::size_t>(u)] = true;
        affectedNodesVec.push_back(u);

        const std::vector<int>& kids = children[static_cast<std::size_t>(u)];
        for (int v : kids) {
            if (!affected[static_cast<std::size_t>(v)]) {
                stack.push_back(v);
            }
        }
    }

    const double inf = std::numeric_limits<double>::infinity();
    for (int node : affectedNodesVec) {
        dist[static_cast<std::size_t>(node)] = inf;
        prev[static_cast<std::size_t>(node)] = -1;
    }

    MinHeap heap;

    for (int u : affectedNodesVec) {
        const std::vector<int>& incident = g.getIncidentEdges(u);
        for (int localEdgeIdx : incident) {
            const Edge& edge = g.getEdge(localEdgeIdx);
            const int v = otherEndpoint(edge, u);

            if (v < 0 || static_cast<std::size_t>(v) >= n) {
                continue;
            }

            if (affected[static_cast<std::size_t>(v)]) {
                continue;
            }

            if (!std::isfinite(dist[static_cast<std::size_t>(v)])) {
                continue;
            }

            const double candidate = dist[static_cast<std::size_t>(v)] + edge.weight + k * edge.sigma;
            if (candidate < dist[static_cast<std::size_t>(u)]) {
                dist[static_cast<std::size_t>(u)] = candidate;
                prev[static_cast<std::size_t>(u)] = v;
            }
        }

        if (std::isfinite(dist[static_cast<std::size_t>(u)])) {
            heap.insert(u, dist[static_cast<std::size_t>(u)]);
        }
    }

    while (!heap.empty()) {
        const std::pair<int, double> minItem = heap.extractMin();
        const int u = minItem.first;
        const double bestKnown = minItem.second;

        if (bestKnown > dist[static_cast<std::size_t>(u)]) {
            continue;
        }

        const std::vector<int>& incident = g.getIncidentEdges(u);
        for (int localEdgeIdx : incident) {
            const Edge& edge = g.getEdge(localEdgeIdx);
            const int v = otherEndpoint(edge, u);

            if (v < 0 || static_cast<std::size_t>(v) >= n) {
                continue;
            }

            if (!affected[static_cast<std::size_t>(v)]) {
                continue;
            }

            const double candidate = dist[static_cast<std::size_t>(u)] + edge.weight + k * edge.sigma;
            if (candidate < dist[static_cast<std::size_t>(v)]) {
                dist[static_cast<std::size_t>(v)] = candidate;
                prev[static_cast<std::size_t>(v)] = u;

                if (heap.contains(v)) {
                    heap.decreaseKey(v, candidate);
                } else {
                    heap.insert(v, candidate);
                }
            }
        }
    }

    refreshSPTFlags(g, prev, k);

    result.recomputeSkipped = false;
    result.nodesRecomputed = static_cast<int>(affectedNodesVec.size());
    result.affectedNodes = sptJsonArray(affectedNodesVec);

    const auto ended = std::chrono::high_resolution_clock::now();
    result.timeMs = std::chrono::duration<double, std::milli>(ended - started).count();

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"edge_update\",";
    json << "\"edgeIdx\":" << edgeIdx << ",";
    json << "\"newWeight\":" << sptJsonDouble(newWeight) << ",";
    json << "\"newSigma\":" << sptJsonDouble(newSigma) << ",";
    json << "\"inSPT\":true,";
    json << "\"recomputeSkipped\":false,";
    json << "\"nodesRecomputed\":" << result.nodesRecomputed << ",";
    json << "\"affectedNodes\":" << result.affectedNodes << ",";
    json << "\"dist\":" << sptJsonArray(dist) << ",";
    json << "\"prev\":" << sptJsonArray(prev) << ",";
    json << "\"timeMs\":" << sptJsonDouble(result.timeMs);
    json << "}";

    std::cout << json.str() << std::endl;

    return result;
}
