#include "graph.h"
#include "heap.h"

#include <algorithm>
#include <chrono>
#include <cmath>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

struct BatchResult {
    int totalUpdates;
    int conflicts;
    int sptUpdates;
    int nonSptUpdates;
    int nodesRecomputed;
    double timeMs;
    double vsSequentialMs;
};

namespace {

struct ParsedUpdate {
    int edgeIdx;
    double newWeight;
    double newSigma;
    bool inSPT;
    int subtreeRoot;
};

std::string batchJsonDouble(double value) {
    if (!std::isfinite(value)) {
        return "null";
    }

    std::ostringstream out;
    out << std::setprecision(15) << value;
    return out.str();
}

std::string batchPairArray(const std::vector<std::pair<int, int>>& pairs) {
    std::ostringstream out;
    out << "[";
    for (std::size_t i = 0; i < pairs.size(); ++i) {
        if (i > 0) {
            out << ",";
        }
        out << "[" << pairs[i].first << "," << pairs[i].second << "]";
    }
    out << "]";
    return out.str();
}

int batchOtherEndpoint(const Edge& edge, int node) {
    return (edge.a == node) ? edge.b : edge.a;
}

bool batchIsValidEdge(const Graph& g, int edgeIdx) {
    return edgeIdx >= 0 && static_cast<std::size_t>(edgeIdx) < g.edgeCount();
}

bool batchIsEdgeInSPT(const Graph& g, int edgeIdx, const std::vector<int>& prev) {
    if (!batchIsValidEdge(g, edgeIdx)) {
        return false;
    }

    const Edge& edge = g.getEdge(edgeIdx);
    if (edge.a < 0 || edge.b < 0 ||
        static_cast<std::size_t>(edge.a) >= prev.size() ||
        static_cast<std::size_t>(edge.b) >= prev.size()) {
        return false;
    }

    if (edge.inSPT) {
        return true;
    }

    return (prev[static_cast<std::size_t>(edge.a)] == edge.b) ||
           (prev[static_cast<std::size_t>(edge.b)] == edge.a);
}

int batchSubtreeRootForEdge(const Graph& g, int edgeIdx, const std::vector<int>& prev) {
    if (!batchIsValidEdge(g, edgeIdx)) {
        return -1;
    }

    const Edge& edge = g.getEdge(edgeIdx);
    if (edge.a >= 0 && static_cast<std::size_t>(edge.a) < prev.size() &&
        prev[static_cast<std::size_t>(edge.a)] == edge.b) {
        return edge.a;
    }

    if (edge.b >= 0 && static_cast<std::size_t>(edge.b) < prev.size() &&
        prev[static_cast<std::size_t>(edge.b)] == edge.a) {
        return edge.b;
    }

    return -1;
}

bool batchIsAncestor(int ancestor, int node, const std::vector<int>& prev) {
    int current = node;
    while (current >= 0 && static_cast<std::size_t>(current) < prev.size()) {
        if (current == ancestor) {
            return true;
        }
        current = prev[static_cast<std::size_t>(current)];
    }
    return false;
}

void batchRefreshSPTFlags(Graph& g, const std::vector<int>& prev, double k) {
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
            const int neighbor = batchOtherEndpoint(edge, static_cast<int>(node));
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

std::vector<bool> batchCollectAffectedMask(
    const std::vector<int>& prev,
    const std::vector<int>& roots,
    std::vector<int>& affectedNodes) {
    const std::size_t n = prev.size();
    std::vector<std::vector<int>> children(n);

    for (std::size_t node = 0; node < n; ++node) {
        const int parent = prev[node];
        if (parent >= 0 && static_cast<std::size_t>(parent) < n) {
            children[static_cast<std::size_t>(parent)].push_back(static_cast<int>(node));
        }
    }

    std::vector<bool> affected(n, false);
    std::vector<int> stack;
    for (int root : roots) {
        if (root >= 0 && static_cast<std::size_t>(root) < n) {
            stack.push_back(root);
        }
    }

    while (!stack.empty()) {
        const int u = stack.back();
        stack.pop_back();

        if (affected[static_cast<std::size_t>(u)]) {
            continue;
        }

        affected[static_cast<std::size_t>(u)] = true;
        affectedNodes.push_back(u);

        for (int child : children[static_cast<std::size_t>(u)]) {
            if (!affected[static_cast<std::size_t>(child)]) {
                stack.push_back(child);
            }
        }
    }

    return affected;
}

int batchRecomputeAffected(
    Graph& g,
    std::vector<double>& dist,
    std::vector<int>& prev,
    double k,
    const std::vector<bool>& affected,
    const std::vector<int>& affectedNodes) {
    if (affectedNodes.empty()) {
        return 0;
    }

    const std::size_t n = g.nodeCount();
    const double inf = std::numeric_limits<double>::infinity();

    for (int node : affectedNodes) {
        dist[static_cast<std::size_t>(node)] = inf;
        prev[static_cast<std::size_t>(node)] = -1;
    }

    MinHeap heap;

    for (int u : affectedNodes) {
        const std::vector<int>& incident = g.getIncidentEdges(u);
        for (int edgeIdx : incident) {
            const Edge& edge = g.getEdge(edgeIdx);
            const int v = batchOtherEndpoint(edge, u);

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
        for (int edgeIdx : incident) {
            const Edge& edge = g.getEdge(edgeIdx);
            const int v = batchOtherEndpoint(edge, u);

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

    return static_cast<int>(affectedNodes.size());
}

int batchApplySingleSelective(
    Graph& g,
    int edgeIdx,
    double newWeight,
    double newSigma,
    std::vector<double>& dist,
    std::vector<int>& prev,
    double k) {
    const bool inSPT = batchIsEdgeInSPT(g, edgeIdx, prev);
    if (!g.updateEdge(edgeIdx, newWeight, newSigma)) {
        return 0;
    }

    if (!inSPT) {
        return 0;
    }

    const int root = batchSubtreeRootForEdge(g, edgeIdx, prev);
    if (root < 0) {
        return 0;
    }

    std::vector<int> affectedNodes;
    const std::vector<bool> affected = batchCollectAffectedMask(prev, {root}, affectedNodes);
    const int nodes = batchRecomputeAffected(g, dist, prev, k, affected, affectedNodes);
    batchRefreshSPTFlags(g, prev, k);
    return nodes;
}

}  // namespace

BatchResult batchUpdate(
    Graph& g,
    std::vector<std::tuple<int, double, double>> updates,
    std::vector<double>& dist,
    std::vector<int>& prev,
    double k) {
    const std::size_t n = g.nodeCount();
    if (dist.size() != n) {
        dist.assign(n, std::numeric_limits<double>::infinity());
    }
    if (prev.size() != n) {
        prev.assign(n, -1);
    }

    Graph seqGraph = g;
    std::vector<double> seqDist = dist;
    std::vector<int> seqPrev = prev;

    std::vector<ParsedUpdate> parsed;
    parsed.reserve(updates.size());

    for (const std::tuple<int, double, double>& t : updates) {
        const int edgeIdx = std::get<0>(t);
        const double newWeight = std::get<1>(t);
        const double newSigma = std::get<2>(t);
        const bool inSPT = batchIsEdgeInSPT(g, edgeIdx, prev);
        const int root = inSPT ? batchSubtreeRootForEdge(g, edgeIdx, prev) : -1;

        ParsedUpdate p;
        p.edgeIdx = edgeIdx;
        p.newWeight = newWeight;
        p.newSigma = newSigma;
        p.inSPT = inSPT;
        p.subtreeRoot = root;
        parsed.push_back(p);
    }

    std::vector<std::pair<int, int>> conflictPairs;
    for (std::size_t i = 0; i < parsed.size(); ++i) {
        if (!parsed[i].inSPT || parsed[i].subtreeRoot < 0) {
            continue;
        }

        for (std::size_t j = i + 1; j < parsed.size(); ++j) {
            if (!parsed[j].inSPT || parsed[j].subtreeRoot < 0) {
                continue;
            }

            bool conflict = false;
            if (parsed[i].edgeIdx == parsed[j].edgeIdx) {
                conflict = true;
            } else if (batchIsAncestor(parsed[i].subtreeRoot, parsed[j].subtreeRoot, prev) ||
                       batchIsAncestor(parsed[j].subtreeRoot, parsed[i].subtreeRoot, prev)) {
                conflict = true;
            }

            if (conflict) {
                conflictPairs.push_back({parsed[i].edgeIdx, parsed[j].edgeIdx});
            }
        }
    }

    std::stable_sort(parsed.begin(), parsed.end(), [](const ParsedUpdate& a, const ParsedUpdate& b) {
        if (a.inSPT == b.inSPT) {
            return false;
        }
        return !a.inSPT && b.inSPT;
    });

    const auto started = std::chrono::high_resolution_clock::now();

    std::vector<int> combinedRoots;
    combinedRoots.reserve(parsed.size());

    int sptUpdates = 0;
    int nonSptUpdates = 0;

    for (const ParsedUpdate& p : parsed) {
        if (p.inSPT) {
            ++sptUpdates;
            if (p.subtreeRoot >= 0) {
                combinedRoots.push_back(p.subtreeRoot);
            }
        } else {
            ++nonSptUpdates;
        }

        g.updateEdge(p.edgeIdx, p.newWeight, p.newSigma);
    }

    std::vector<int> affectedNodes;
    std::vector<bool> affected(n, false);
    if (!combinedRoots.empty()) {
        affected = batchCollectAffectedMask(prev, combinedRoots, affectedNodes);
    }

    const int nodesRecomputed = batchRecomputeAffected(g, dist, prev, k, affected, affectedNodes);
    batchRefreshSPTFlags(g, prev, k);

    const auto ended = std::chrono::high_resolution_clock::now();
    const double batchMs = std::chrono::duration<double, std::milli>(ended - started).count();

    const auto seqStarted = std::chrono::high_resolution_clock::now();
    for (const std::tuple<int, double, double>& t : updates) {
        batchApplySingleSelective(
            seqGraph,
            std::get<0>(t),
            std::get<1>(t),
            std::get<2>(t),
            seqDist,
            seqPrev,
            k);
    }
    const auto seqEnded = std::chrono::high_resolution_clock::now();
    const double seqMs = std::chrono::duration<double, std::milli>(seqEnded - seqStarted).count();

    std::ostringstream conflictJson;
    conflictJson << "{";
    conflictJson << "\"type\":\"batch_conflicts\",";
    conflictJson << "\"totalUpdates\":" << updates.size() << ",";
    conflictJson << "\"conflicts\":" << conflictPairs.size() << ",";
    conflictJson << "\"pairs\":" << batchPairArray(conflictPairs);
    conflictJson << "}";
    std::cout << conflictJson.str() << std::endl;

    BatchResult result;
    result.totalUpdates = static_cast<int>(updates.size());
    result.conflicts = static_cast<int>(conflictPairs.size());
    result.sptUpdates = sptUpdates;
    result.nonSptUpdates = nonSptUpdates;
    result.nodesRecomputed = nodesRecomputed;
    result.timeMs = batchMs;
    result.vsSequentialMs = seqMs;

    std::ostringstream doneJson;
    doneJson << "{";
    doneJson << "\"type\":\"batch_done\",";
    doneJson << "\"totalUpdates\":" << result.totalUpdates << ",";
    doneJson << "\"conflicts\":" << result.conflicts << ",";
    doneJson << "\"sptUpdates\":" << result.sptUpdates << ",";
    doneJson << "\"nonSptUpdates\":" << result.nonSptUpdates << ",";
    doneJson << "\"nodesRecomputed\":" << result.nodesRecomputed << ",";
    doneJson << "\"timeMs\":" << batchJsonDouble(result.timeMs) << ",";
    doneJson << "\"vsSequentialMs\":" << batchJsonDouble(result.vsSequentialMs);
    doneJson << "}";
    std::cout << doneJson.str() << std::endl;

    return result;
}
