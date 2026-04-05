#ifndef HEAP_H
#define HEAP_H

/*
Time complexity summary (n = elements in heap):
- insert(nodeId, key): O(log n)
- extractMin(): O(log n)
- decreaseKey(nodeId, newKey): O(log n)
- contains(nodeId): O(1) average (hash-based position map)

Space complexity: O(n)
Implementation detail: array-based binary heap with a nodeId -> heap index position map.
*/

#include <cstddef>
#include <stdexcept>
#include <unordered_map>
#include <utility>
#include <vector>

class MinHeap {
public:
    void insert(int nodeId, double key) {
        auto it = position_.find(nodeId);
        if (it != position_.end()) {
            if (key < heap_[it->second].key) {
                decreaseKey(nodeId, key);
            }
            return;
        }

        Entry entry;
        entry.nodeId = nodeId;
        entry.key = key;

        heap_.push_back(entry);
        const std::size_t idx = heap_.size() - 1;
        position_[nodeId] = idx;
        siftUp(idx);
    }

    std::pair<int, double> extractMin() {
        if (heap_.empty()) {
            throw std::out_of_range("extractMin() called on empty MinHeap");
        }

        const Entry minEntry = heap_.front();
        position_.erase(minEntry.nodeId);

        if (heap_.size() == 1) {
            heap_.pop_back();
            return {minEntry.nodeId, minEntry.key};
        }

        heap_[0] = heap_.back();
        heap_.pop_back();
        position_[heap_[0].nodeId] = 0;
        siftDown(0);

        return {minEntry.nodeId, minEntry.key};
    }

    void decreaseKey(int nodeId, double newKey) {
        auto it = position_.find(nodeId);
        if (it == position_.end()) {
            return;
        }

        const std::size_t idx = it->second;
        if (newKey >= heap_[idx].key) {
            return;
        }

        heap_[idx].key = newKey;
        siftUp(idx);
    }

    bool contains(int nodeId) const {
        return position_.find(nodeId) != position_.end();
    }

    bool empty() const {
        return heap_.empty();
    }

    std::size_t size() const {
        return heap_.size();
    }

private:
    struct Entry {
        int nodeId;
        double key;
    };

    void swapEntries(std::size_t i, std::size_t j) {
        std::swap(heap_[i], heap_[j]);
        position_[heap_[i].nodeId] = i;
        position_[heap_[j].nodeId] = j;
    }

    void siftUp(std::size_t idx) {
        while (idx > 0) {
            const std::size_t parent = (idx - 1) / 2;
            if (heap_[parent].key <= heap_[idx].key) {
                break;
            }
            swapEntries(parent, idx);
            idx = parent;
        }
    }

    void siftDown(std::size_t idx) {
        const std::size_t n = heap_.size();

        while (true) {
            const std::size_t left = idx * 2 + 1;
            const std::size_t right = idx * 2 + 2;
            std::size_t smallest = idx;

            if (left < n && heap_[left].key < heap_[smallest].key) {
                smallest = left;
            }
            if (right < n && heap_[right].key < heap_[smallest].key) {
                smallest = right;
            }

            if (smallest == idx) {
                break;
            }

            swapEntries(idx, smallest);
            idx = smallest;
        }
    }

    std::vector<Entry> heap_;
    std::unordered_map<int, std::size_t> position_;
};

#endif  // HEAP_H
