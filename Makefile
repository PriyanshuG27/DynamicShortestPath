CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra

ifeq ($(OS),Windows_NT)
TARGET := main.exe
else
TARGET := main
endif

SRC := core_engine/main.cpp
DEPS := core_engine/graph.h core_engine/heap.h core_engine/dijkstra.cpp core_engine/bellman.cpp core_engine/spt.cpp core_engine/adversarial.cpp core_engine/batch.cpp

.PHONY: all run clean

all: $(TARGET)

$(TARGET): $(SRC) $(DEPS)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f main main.exe
