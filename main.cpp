#include "graph.h"

#include <cctype>
#include <cmath>
#include <cstddef>
#include <iostream>
#include <limits>
#include <sstream>
#include <string>
#include <tuple>
#include <utility>
#include <vector>

#include "dijkstra.cpp"
#include "bellman.cpp"
#include "spt.cpp"
#include "adversarial.cpp"
#include "batch.cpp"

namespace {

struct JsonValue {
    enum class Type {
        kNull,
        kBool,
        kNumber,
        kString,
        kArray,
        kObject,
    };

    Type type;
    bool boolValue;
    double numberValue;
    std::string stringValue;
    std::vector<JsonValue> arrayValue;
    std::vector<std::pair<std::string, JsonValue>> objectValue;

    JsonValue()
        : type(Type::kNull), boolValue(false), numberValue(0.0) {}

    static JsonValue makeNull() {
        return JsonValue();
    }

    static JsonValue makeBool(bool value) {
        JsonValue v;
        v.type = Type::kBool;
        v.boolValue = value;
        return v;
    }

    static JsonValue makeNumber(double value) {
        JsonValue v;
        v.type = Type::kNumber;
        v.numberValue = value;
        return v;
    }

    static JsonValue makeString(const std::string& value) {
        JsonValue v;
        v.type = Type::kString;
        v.stringValue = value;
        return v;
    }

    static JsonValue makeArray() {
        JsonValue v;
        v.type = Type::kArray;
        return v;
    }

    static JsonValue makeObject() {
        JsonValue v;
        v.type = Type::kObject;
        return v;
    }
};

class JsonParser {
public:
    explicit JsonParser(const std::string& text)
        : text_(text), pos_(0) {}

    bool parse(JsonValue& out) {
        skipWhitespace();
        if (!parseValue(out)) {
            return false;
        }

        skipWhitespace();
        if (pos_ != text_.size()) {
            setError("trailing characters after JSON value");
            return false;
        }

        return true;
    }

    const std::string& error() const {
        return error_;
    }

private:
    const std::string& text_;
    std::size_t pos_;
    std::string error_;

    void setError(const std::string& message) {
        if (error_.empty()) {
            std::ostringstream out;
            out << message << " at position " << pos_;
            error_ = out.str();
        }
    }

    void skipWhitespace() {
        while (pos_ < text_.size() &&
               std::isspace(static_cast<unsigned char>(text_[pos_])) != 0) {
            ++pos_;
        }
    }

    bool consume(char expected) {
        if (pos_ < text_.size() && text_[pos_] == expected) {
            ++pos_;
            return true;
        }
        return false;
    }

    bool parseValue(JsonValue& out) {
        skipWhitespace();
        if (pos_ >= text_.size()) {
            setError("unexpected end of input");
            return false;
        }

        const char c = text_[pos_];
        if (c == '{') {
            return parseObject(out);
        }
        if (c == '[') {
            return parseArray(out);
        }
        if (c == '"') {
            std::string s;
            if (!parseString(s)) {
                return false;
            }
            out = JsonValue::makeString(s);
            return true;
        }
        if (c == 't') {
            return parseLiteral("true", JsonValue::makeBool(true), out);
        }
        if (c == 'f') {
            return parseLiteral("false", JsonValue::makeBool(false), out);
        }
        if (c == 'n') {
            return parseLiteral("null", JsonValue::makeNull(), out);
        }
        if (c == '-' || std::isdigit(static_cast<unsigned char>(c)) != 0) {
            return parseNumber(out);
        }

        setError("unexpected token");
        return false;
    }

    bool parseLiteral(const char* keyword, const JsonValue& value, JsonValue& out) {
        std::size_t i = 0;
        while (keyword[i] != '\0') {
            if (pos_ + i >= text_.size() || text_[pos_ + i] != keyword[i]) {
                setError("invalid literal");
                return false;
            }
            ++i;
        }

        pos_ += i;
        out = value;
        return true;
    }

    bool parseObject(JsonValue& out) {
        if (!consume('{')) {
            setError("expected '{'");
            return false;
        }

        out = JsonValue::makeObject();
        skipWhitespace();

        if (consume('}')) {
            return true;
        }

        while (true) {
            std::string key;
            if (!parseString(key)) {
                return false;
            }

            skipWhitespace();
            if (!consume(':')) {
                setError("expected ':' after object key");
                return false;
            }

            JsonValue value;
            if (!parseValue(value)) {
                return false;
            }

            out.objectValue.push_back(std::make_pair(key, value));
            skipWhitespace();

            if (consume('}')) {
                return true;
            }
            if (!consume(',')) {
                setError("expected ',' or '}' in object");
                return false;
            }
            skipWhitespace();
        }
    }

    bool parseArray(JsonValue& out) {
        if (!consume('[')) {
            setError("expected '['");
            return false;
        }

        out = JsonValue::makeArray();
        skipWhitespace();

        if (consume(']')) {
            return true;
        }

        while (true) {
            JsonValue value;
            if (!parseValue(value)) {
                return false;
            }
            out.arrayValue.push_back(value);

            skipWhitespace();
            if (consume(']')) {
                return true;
            }
            if (!consume(',')) {
                setError("expected ',' or ']' in array");
                return false;
            }
            skipWhitespace();
        }
    }

    bool parseString(std::string& out) {
        if (!consume('"')) {
            setError("expected string");
            return false;
        }

        out.clear();
        while (pos_ < text_.size()) {
            const char c = text_[pos_++];
            if (c == '"') {
                return true;
            }

            if (c == '\\') {
                if (pos_ >= text_.size()) {
                    setError("unterminated escape sequence");
                    return false;
                }

                const char esc = text_[pos_++];
                switch (esc) {
                    case '"': out.push_back('"'); break;
                    case '\\': out.push_back('\\'); break;
                    case '/': out.push_back('/'); break;
                    case 'b': out.push_back('\b'); break;
                    case 'f': out.push_back('\f'); break;
                    case 'n': out.push_back('\n'); break;
                    case 'r': out.push_back('\r'); break;
                    case 't': out.push_back('\t'); break;
                    case 'u': {
                        if (pos_ + 4 > text_.size()) {
                            setError("invalid unicode escape");
                            return false;
                        }

                        int code = 0;
                        for (int i = 0; i < 4; ++i) {
                            const char h = text_[pos_ + static_cast<std::size_t>(i)];
                            code <<= 4;
                            if (h >= '0' && h <= '9') {
                                code += h - '0';
                            } else if (h >= 'a' && h <= 'f') {
                                code += 10 + (h - 'a');
                            } else if (h >= 'A' && h <= 'F') {
                                code += 10 + (h - 'A');
                            } else {
                                setError("invalid unicode escape");
                                return false;
                            }
                        }
                        pos_ += 4;

                        if (code >= 0 && code <= 0x7F) {
                            out.push_back(static_cast<char>(code));
                        } else {
                            out.push_back('?');
                        }
                        break;
                    }
                    default:
                        setError("invalid escape character");
                        return false;
                }
                continue;
            }

            if (static_cast<unsigned char>(c) < 0x20) {
                setError("control character in string");
                return false;
            }

            out.push_back(c);
        }

        setError("unterminated string");
        return false;
    }

    bool parseNumber(JsonValue& out) {
        const std::size_t start = pos_;

        if (text_[pos_] == '-') {
            ++pos_;
            if (pos_ >= text_.size()) {
                setError("invalid number");
                return false;
            }
        }

        if (text_[pos_] == '0') {
            ++pos_;
        } else {
            if (std::isdigit(static_cast<unsigned char>(text_[pos_])) == 0) {
                setError("invalid number");
                return false;
            }
            while (pos_ < text_.size() &&
                   std::isdigit(static_cast<unsigned char>(text_[pos_])) != 0) {
                ++pos_;
            }
        }

        if (pos_ < text_.size() && text_[pos_] == '.') {
            ++pos_;
            if (pos_ >= text_.size() ||
                std::isdigit(static_cast<unsigned char>(text_[pos_])) == 0) {
                setError("invalid fractional part");
                return false;
            }
            while (pos_ < text_.size() &&
                   std::isdigit(static_cast<unsigned char>(text_[pos_])) != 0) {
                ++pos_;
            }
        }

        if (pos_ < text_.size() && (text_[pos_] == 'e' || text_[pos_] == 'E')) {
            ++pos_;
            if (pos_ < text_.size() && (text_[pos_] == '+' || text_[pos_] == '-')) {
                ++pos_;
            }
            if (pos_ >= text_.size() ||
                std::isdigit(static_cast<unsigned char>(text_[pos_])) == 0) {
                setError("invalid exponent");
                return false;
            }
            while (pos_ < text_.size() &&
                   std::isdigit(static_cast<unsigned char>(text_[pos_])) != 0) {
                ++pos_;
            }
        }

        const std::string token = text_.substr(start, pos_ - start);
        try {
            out = JsonValue::makeNumber(std::stod(token));
        } catch (...) {
            setError("invalid numeric value");
            return false;
        }

        return true;
    }
};

std::string escapeJson(const std::string& text) {
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

const JsonValue* getObjectField(const JsonValue& obj, const std::string& key) {
    if (obj.type != JsonValue::Type::kObject) {
        return nullptr;
    }

    for (const std::pair<std::string, JsonValue>& entry : obj.objectValue) {
        if (entry.first == key) {
            return &entry.second;
        }
    }
    return nullptr;
}

bool toString(const JsonValue* value, std::string& out) {
    if (value == nullptr || value->type != JsonValue::Type::kString) {
        return false;
    }
    out = value->stringValue;
    return true;
}

bool toDouble(const JsonValue* value, double& out) {
    if (value == nullptr || value->type != JsonValue::Type::kNumber) {
        return false;
    }
    out = value->numberValue;
    return true;
}

bool toInt(const JsonValue* value, int& out) {
    if (value == nullptr || value->type != JsonValue::Type::kNumber) {
        return false;
    }

    const double rounded = std::round(value->numberValue);
    if (std::fabs(value->numberValue - rounded) > 1e-9) {
        return false;
    }

    if (rounded < static_cast<double>(std::numeric_limits<int>::min()) ||
        rounded > static_cast<double>(std::numeric_limits<int>::max())) {
        return false;
    }

    out = static_cast<int>(rounded);
    return true;
}

void emitError(const std::string& message, const std::string& cmd = "") {
    std::ostringstream json;
    json << "{";
    json << "\"type\":\"error\",";
    if (!cmd.empty()) {
        json << "\"cmd\":\"" << escapeJson(cmd) << "\",";
    }
    json << "\"message\":\"" << escapeJson(message) << "\"";
    json << "}";
    std::cout << json.str() << std::endl;
}

void emitInfo(const std::string& type, int nodes, int edges) {
    std::ostringstream json;
    json << "{";
    json << "\"type\":\"" << type << "\",";
    json << "\"nodes\":" << nodes << ",";
    json << "\"edges\":" << edges;
    json << "}";
    std::cout << json.str() << std::endl;
}

bool parseInitEdges(
    const JsonValue& edgesValue,
    std::vector<std::tuple<int, int, double, double>>& edgesOut) {
    if (edgesValue.type != JsonValue::Type::kArray) {
        return false;
    }

    edgesOut.clear();
    for (const JsonValue& edgeTuple : edgesValue.arrayValue) {
        if (edgeTuple.type != JsonValue::Type::kArray || edgeTuple.arrayValue.size() < 4) {
            return false;
        }

        int a = 0;
        int b = 0;
        double w = 0.0;
        double s = 0.0;

        if (!toInt(&edgeTuple.arrayValue[0], a) ||
            !toInt(&edgeTuple.arrayValue[1], b) ||
            !toDouble(&edgeTuple.arrayValue[2], w) ||
            !toDouble(&edgeTuple.arrayValue[3], s)) {
            return false;
        }

        edgesOut.push_back(std::make_tuple(a, b, w, s));
    }

    return true;
}

bool parseBatchUpdates(
    const JsonValue& updatesValue,
    std::vector<std::tuple<int, double, double>>& updatesOut) {
    if (updatesValue.type != JsonValue::Type::kArray) {
        return false;
    }

    updatesOut.clear();
    for (const JsonValue& updateTuple : updatesValue.arrayValue) {
        if (updateTuple.type != JsonValue::Type::kArray || updateTuple.arrayValue.size() < 3) {
            return false;
        }

        int edgeIdx = 0;
        double w = 0.0;
        double s = 0.0;

        if (!toInt(&updateTuple.arrayValue[0], edgeIdx) ||
            !toDouble(&updateTuple.arrayValue[1], w) ||
            !toDouble(&updateTuple.arrayValue[2], s)) {
            return false;
        }

        updatesOut.push_back(std::make_tuple(edgeIdx, w, s));
    }

    return true;
}

}  // namespace

int main() {
    Graph graph;
    Graph initialGraph;

    bool initialized = false;
    bool hasPathState = false;

    int lastSource = 0;
    double lastK = 1.0;

    std::vector<double> dist;
    std::vector<int> prev;

    std::string line;
    while (std::getline(std::cin, line)) {
        if (line.empty()) {
            continue;
        }

        JsonValue root;
        JsonParser parser(line);
        if (!parser.parse(root)) {
            emitError(std::string("invalid_json: ") + parser.error());
            continue;
        }

        if (root.type != JsonValue::Type::kObject) {
            emitError("invalid_request: top-level JSON must be an object");
            continue;
        }

        std::string cmd;
        if (!toString(getObjectField(root, "cmd"), cmd)) {
            emitError("invalid_request: missing or invalid cmd");
            continue;
        }

        if (cmd == "init") {
            int nodes = 0;
            if (!toInt(getObjectField(root, "nodes"), nodes) || nodes < 0) {
                emitError("invalid_init: nodes must be a non-negative integer", cmd);
                continue;
            }

            const JsonValue* edgesValue = getObjectField(root, "edges");
            if (edgesValue == nullptr) {
                emitError("invalid_init: missing edges array", cmd);
                continue;
            }

            std::vector<std::tuple<int, int, double, double>> edges;
            if (!parseInitEdges(*edgesValue, edges)) {
                emitError("invalid_init: edges must be [[a,b,weight,sigma], ...]", cmd);
                continue;
            }

            Graph nextGraph;
            for (int i = 0; i < nodes; ++i) {
                nextGraph.addNode();
            }

            bool edgeError = false;
            for (const std::tuple<int, int, double, double>& e : edges) {
                const int idx = nextGraph.addEdge(
                    std::get<0>(e),
                    std::get<1>(e),
                    std::get<2>(e),
                    std::get<3>(e));
                if (idx < 0) {
                    edgeError = true;
                    break;
                }
            }

            if (edgeError) {
                emitError("invalid_init: one or more edges reference invalid node ids", cmd);
                continue;
            }

            graph = nextGraph;
            initialGraph = nextGraph;
            initialized = true;
            hasPathState = false;
            lastSource = 0;
            lastK = 1.0;

            dist.assign(graph.nodeCount(), std::numeric_limits<double>::infinity());
            prev.assign(graph.nodeCount(), -1);

            emitInfo("init_done", static_cast<int>(graph.nodeCount()), static_cast<int>(graph.edgeCount()));
            continue;
        }

        if (cmd == "run_dijkstra") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }

            int source = 0;
            double k = 1.0;
            if (!toInt(getObjectField(root, "source"), source) ||
                !toDouble(getObjectField(root, "k"), k)) {
                emitError("invalid_run_dijkstra: require source(int) and k(number)", cmd);
                continue;
            }

            const DijkstraResult result = runProbabilisticDijkstra(graph, source, k);
            dist = result.dist;
            prev = result.prev;
            hasPathState = true;
            lastSource = source;
            lastK = k;
            continue;
        }

        if (cmd == "run_standard") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }

            int source = 0;
            if (!toInt(getObjectField(root, "source"), source)) {
                emitError("invalid_run_standard: require source(int)", cmd);
                continue;
            }

            const DijkstraResult result = runStandardDijkstra(graph, source);
            dist = result.dist;
            prev = result.prev;
            hasPathState = true;
            lastSource = source;
            lastK = 0.0;
            continue;
        }

        if (cmd == "run_bellman") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }

            int source = 0;
            if (!toInt(getObjectField(root, "source"), source)) {
                emitError("invalid_run_bellman: require source(int)", cmd);
                continue;
            }

            const DijkstraResult result = runBellmanFord(graph, source);
            dist = result.dist;
            prev = result.prev;
            hasPathState = true;
            lastSource = source;
            lastK = 0.0;
            continue;
        }

        if (cmd == "update") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }
            if (!hasPathState) {
                emitError("missing_path_state: run an algorithm before selective update", cmd);
                continue;
            }

            int edgeIdx = 0;
            double weight = 0.0;
            double sigma = 0.0;

            if (!toInt(getObjectField(root, "edgeIdx"), edgeIdx) ||
                !toDouble(getObjectField(root, "weight"), weight) ||
                !toDouble(getObjectField(root, "sigma"), sigma)) {
                emitError("invalid_update: require edgeIdx(int), weight(number), sigma(number)", cmd);
                continue;
            }

            std::string mode = "selective";
            const JsonValue* modeValue = getObjectField(root, "mode");
            if (modeValue != nullptr && !toString(modeValue, mode)) {
                emitError("invalid_update: mode must be string", cmd);
                continue;
            }

            if (mode != "selective") {
                emitError("unsupported_mode: only mode=selective is supported", cmd);
                continue;
            }

            double k = lastK;
            const JsonValue* kValue = getObjectField(root, "k");
            if (kValue != nullptr && !toDouble(kValue, k)) {
                emitError("invalid_update: k must be numeric when provided", cmd);
                continue;
            }

            const SelectiveResult result = handleEdgeUpdate(graph, edgeIdx, weight, sigma, dist, prev, k);
            (void)result;
            continue;
        }

        if (cmd == "adversarial") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }
            if (!hasPathState) {
                emitError("missing_path_state: run an algorithm before adversarial update", cmd);
                continue;
            }

            double k = lastK;
            const JsonValue* kValue = getObjectField(root, "k");
            if (kValue != nullptr && !toDouble(kValue, k)) {
                emitError("invalid_adversarial: k must be numeric when provided", cmd);
                continue;
            }

            const AdversarialUpdate result = generateAdversarialUpdate(graph, dist, prev, k);
            (void)result;
            continue;
        }

        if (cmd == "random_update") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }

            const RandomUpdate result = generateRandomUpdate(graph);
            (void)result;
            continue;
        }

        if (cmd == "batch") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }
            if (!hasPathState) {
                emitError("missing_path_state: run an algorithm before batch update", cmd);
                continue;
            }

            const JsonValue* updatesValue = getObjectField(root, "updates");
            if (updatesValue == nullptr) {
                emitError("invalid_batch: missing updates array", cmd);
                continue;
            }

            std::vector<std::tuple<int, double, double>> updates;
            if (!parseBatchUpdates(*updatesValue, updates)) {
                emitError("invalid_batch: updates must be [[edgeIdx,weight,sigma], ...]", cmd);
                continue;
            }

            double k = lastK;
            const JsonValue* kValue = getObjectField(root, "k");
            if (kValue != nullptr && !toDouble(kValue, k)) {
                emitError("invalid_batch: k must be numeric when provided", cmd);
                continue;
            }

            const BatchResult result = batchUpdate(graph, updates, dist, prev, k);
            (void)result;
            continue;
        }

        if (cmd == "reset") {
            if (!initialized) {
                emitError("not_initialized: call init first", cmd);
                continue;
            }

            graph = initialGraph;
            dist.assign(graph.nodeCount(), std::numeric_limits<double>::infinity());
            prev.assign(graph.nodeCount(), -1);
            hasPathState = false;
            lastSource = 0;
            lastK = 1.0;

            emitInfo("reset_done", static_cast<int>(graph.nodeCount()), static_cast<int>(graph.edgeCount()));
            continue;
        }

        if (cmd == "quit") {
            std::cout << "{\"type\":\"bye\"}" << std::endl;
            break;
        }

        emitError("unknown_command", cmd);
    }

    return 0;
}
