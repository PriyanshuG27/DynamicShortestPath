#include "graph.h"

#include <cmath>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <limits>
#include <random>
#include <sstream>
#include <string>
#include <vector>

struct AdversarialUpdate {
    int edgeIdx;
    double oldWeight;
    double newWeight;
    std::string reasoning;
};

struct RandomUpdate {
    int edgeIdx;
    double oldWeight;
    double newWeight;
    double oldSigma;
    double newSigma;
};

namespace {

double advRound1(double value) {
    return std::round(value * 10.0) / 10.0;
}

std::string advJsonDouble(double value) {
    if (!std::isfinite(value)) {
        return "null";
    }

    std::ostringstream out;
    out << std::setprecision(15) << value;
    return out.str();
}

std::string advEscapeJson(const std::string& text) {
    std::ostringstream out;
    for (char c : text) {
        if (c == '\\') {
            out << "\\\\";
        } else if (c == '"') {
            out << "\\\"";
        } else if (c == '\n') {
            out << "\\n";
        } else {
            out << c;
        }
    }
    return out.str();
}

bool advEdgeInSPTByPrev(const Edge& edge, const std::vector<int>& prev) {
    if (edge.a < 0 || edge.b < 0) {
        return false;
    }

    if (static_cast<std::size_t>(edge.a) >= prev.size() ||
        static_cast<std::size_t>(edge.b) >= prev.size()) {
        return false;
    }

    return (prev[static_cast<std::size_t>(edge.a)] == edge.b) ||
           (prev[static_cast<std::size_t>(edge.b)] == edge.a);
}

std::mt19937& advRng() {
    static std::mt19937 rng(std::random_device{}());
    return rng;
}

}  // namespace

AdversarialUpdate generateAdversarialUpdate(
    Graph& g,
    std::vector<double>& dist,
    std::vector<int>& prev,
    double k) {
    (void)dist;
    (void)k;

    AdversarialUpdate result;
    result.edgeIdx = -1;
    result.oldWeight = 0.0;
    result.newWeight = 0.0;
    result.reasoning = "No SPT edge available for adversarial update.";

    const std::size_t m = g.edgeCount();
    double bestScore = -std::numeric_limits<double>::infinity();

    for (std::size_t i = 0; i < m; ++i) {
        const Edge& edge = g.getEdge(static_cast<int>(i));
        const bool inSPT = edge.inSPT || advEdgeInSPTByPrev(edge, prev);
        if (!inSPT) {
            continue;
        }

        const double score = edge.weight * edge.sigma;
        if (score > bestScore) {
            bestScore = score;
            result.edgeIdx = static_cast<int>(i);
            result.oldWeight = edge.weight;
        }
    }

    bool inSPTInJson = false;

    if (result.edgeIdx >= 0) {
        Edge& chosen = g.getEdge(result.edgeIdx);
        result.oldWeight = chosen.weight;
        result.newWeight = chosen.weight * 2.0;
        chosen.weight = result.newWeight;
        inSPTInJson = true;

        std::ostringstream reason;
        reason << "Selected SPT edge with maximum weight*sigma score="
               << std::setprecision(15) << (chosen.weight * 0.5) * chosen.sigma
               << "; doubled weight from " << std::setprecision(15) << result.oldWeight
               << " to " << std::setprecision(15) << result.newWeight << ".";
        result.reasoning = reason.str();
    }

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"adversarial_update\",";
    json << "\"edgeIdx\":" << result.edgeIdx << ",";
    json << "\"oldWeight\":" << advJsonDouble(result.oldWeight) << ",";
    json << "\"newWeight\":" << advJsonDouble(result.newWeight) << ",";
    json << "\"inSPT\":" << (inSPTInJson ? "true" : "false") << ",";
    json << "\"reasoning\":\"" << advEscapeJson(result.reasoning) << "\"";
    json << "}";

    std::cout << json.str() << std::endl;
    return result;
}

RandomUpdate generateRandomUpdate(Graph& g) {
    RandomUpdate result;
    result.edgeIdx = -1;
    result.oldWeight = 0.0;
    result.newWeight = 0.0;
    result.oldSigma = 0.0;
    result.newSigma = 0.0;

    const std::size_t m = g.edgeCount();
    bool inSPTInJson = false;

    if (m > 0) {
        std::uniform_int_distribution<int> edgeDist(0, static_cast<int>(m) - 1);
        const int idx = edgeDist(advRng());

        Edge& edge = g.getEdge(idx);
        result.edgeIdx = idx;
        result.oldWeight = edge.weight;
        result.oldSigma = edge.sigma;
        inSPTInJson = edge.inSPT;

        std::uniform_real_distribution<double> weightScale(0.5, 1.8);
        std::uniform_real_distribution<double> sigmaVal(0.1, 1.5);

        result.newWeight = advRound1(result.oldWeight * weightScale(advRng()));
        result.newSigma = advRound1(sigmaVal(advRng()));

        edge.weight = result.newWeight;
        edge.sigma = result.newSigma;
    }

    std::ostringstream json;
    json << "{";
    json << "\"type\":\"random_update\",";
    json << "\"edgeIdx\":" << result.edgeIdx << ",";
    json << "\"oldWeight\":" << advJsonDouble(result.oldWeight) << ",";
    json << "\"newWeight\":" << advJsonDouble(result.newWeight) << ",";
    json << "\"oldSigma\":" << advJsonDouble(result.oldSigma) << ",";
    json << "\"newSigma\":" << advJsonDouble(result.newSigma) << ",";
    json << "\"inSPT\":" << (inSPTInJson ? "true" : "false");
    json << "}";

    std::cout << json.str() << std::endl;
    return result;
}
