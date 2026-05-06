#ifndef GRAPH_H
#define GRAPH_H

/*
Time complexity summary (n = nodes, m = edges, deg(v) = degree of node v):
- addNode(): O(1) amortized
- addEdge(a, b, weight, sigma): O(1) amortized
- removeEdge(idx): O(m) worst-case (removes edge and reindexes stored edge indices)
- updateEdge(idx, newWeight, newSigma): O(1)
- getNeighbors(nodeId): O(deg(v))
- getIncidentEdges(nodeId): O(1)
- getEdge(idx): O(1)
- clearSPTMarks(): O(m)
- edgeCount(): O(1)
- nodeCount(): O(1)
*/

#include <algorithm>
#include <cstddef>
#include <vector>

struct Edge {
    int a;
    int b;
    double weight;
    double sigma;
    bool inSPT;
};

struct Node {
    int id;
    std::vector<int> edgeIndices;
};

class Graph {
public:
    int addNode() {
        Node node;
        node.id = static_cast<int>(nodes_.size());
        nodes_.push_back(node);
        return node.id;
    }

    int addEdge(int a, int b, double weight, double sigma) {
        if (!isValidNodeId(a) || !isValidNodeId(b)) {
            return -1;
        }

        Edge edge;
        edge.a = a;
        edge.b = b;
        edge.weight = weight;
        edge.sigma = sigma;
        edge.inSPT = false;

        edges_.push_back(edge);
        const int idx = static_cast<int>(edges_.size()) - 1;

        nodes_[a].edgeIndices.push_back(idx);
        nodes_[b].edgeIndices.push_back(idx);

        return idx;
    }

    bool removeEdge(int idx) {
        if (idx < 0 || static_cast<std::size_t>(idx) >= edges_.size()) {
            return false;
        }

        const Edge removed = edges_[idx];

        auto eraseEdgeRef = [idx](std::vector<int>& refs) {
            refs.erase(std::remove(refs.begin(), refs.end(), idx), refs.end());
        };

        eraseEdgeRef(nodes_[removed.a].edgeIndices);
        if (removed.b != removed.a) {
            eraseEdgeRef(nodes_[removed.b].edgeIndices);
        }

        edges_.erase(edges_.begin() + idx);
        reindexEdgeReferencesAfterErase(idx);

        return true;
    }

    bool updateEdge(int idx, double newWeight, double newSigma) {
        if (idx < 0 || static_cast<std::size_t>(idx) >= edges_.size()) {
            return false;
        }

        edges_[idx].weight = newWeight;
        edges_[idx].sigma = newSigma;
        return true;
    }

    std::vector<int> getNeighbors(int nodeId) const {
        if (!isValidNodeId(nodeId)) {
            return {};
        }

        std::vector<int> neighbors;
        neighbors.reserve(nodes_[nodeId].edgeIndices.size());

        for (int edgeIdx : nodes_[nodeId].edgeIndices) {
            if (edgeIdx < 0 || static_cast<std::size_t>(edgeIdx) >= edges_.size()) {
                continue;
            }

            const Edge& edge = edges_[edgeIdx];
            const int neighbor = (edge.a == nodeId) ? edge.b : edge.a;
            neighbors.push_back(neighbor);
        }

        return neighbors;
    }

    const std::vector<int>& getIncidentEdges(int nodeId) const {
        static const std::vector<int> kEmpty;
        if (!isValidNodeId(nodeId)) {
            return kEmpty;
        }
        return nodes_[nodeId].edgeIndices;
    }

    Edge& getEdge(int idx) {
        return edges_.at(static_cast<std::size_t>(idx));
    }

    const Edge& getEdge(int idx) const {
        return edges_.at(static_cast<std::size_t>(idx));
    }

    void clearSPTMarks() {
        for (Edge& edge : edges_) {
            edge.inSPT = false;
        }
    }

    std::size_t edgeCount() const {
        return edges_.size();
    }

    std::size_t nodeCount() const {
        return nodes_.size();
    }

private:
    bool isValidNodeId(int nodeId) const {
        return nodeId >= 0 && static_cast<std::size_t>(nodeId) < nodes_.size();
    }

    void reindexEdgeReferencesAfterErase(int erasedIndex) {
        for (Node& node : nodes_) {
            for (int& edgeIdx : node.edgeIndices) {
                if (edgeIdx > erasedIndex) {
                    --edgeIdx;
                }
            }
        }
    }

    std::vector<Node> nodes_;
    std::vector<Edge> edges_;
};

#endif  // GRAPH_H
