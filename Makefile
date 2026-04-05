CXX ?= g++
CXXFLAGS ?= -std=c++17 -O2 -Wall -Wextra

ifeq ($(OS),Windows_NT)
TARGET := main.exe
else
TARGET := main
endif

SRC := main.cpp
DEPS := graph.h heap.h dijkstra.cpp bellman.cpp spt.cpp adversarial.cpp batch.cpp

.PHONY: all run clean

all: $(TARGET)

$(TARGET): $(SRC) $(DEPS)
	$(CXX) $(CXXFLAGS) $(SRC) -o $(TARGET)

run: $(TARGET)
	./$(TARGET)

clean:
	rm -f main main.exe
