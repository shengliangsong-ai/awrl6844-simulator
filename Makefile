# =====================================================================================
# Texas Instruments AWRL6844 Power-On BIST DSP & HWA Verification Simulator Makefile
# Target: Host Native Simulator (GCC / Clang) & Embedded Cross-Compile Validation
# =====================================================================================

CC ?= gcc
# -D_POSIX_C_SOURCE=200809L enables strdup in strict c99 pedantic mode across Linux/macOS
CFLAGS ?= -O2 -Wall -Wextra -Werror -std=c99 -pedantic -D_POSIX_C_SOURCE=200809L
LDFLAGS ?= -lm

DOC_SRC = doc/awrl6844_bist_dsp_test.c
TARGET = bist_sim

.PHONY: all run run-stages run-trace clean help memcheck info

all: $(TARGET)

$(TARGET): $(DOC_SRC)
	@echo "Compiling AWRL6844 Power-On BIST DSP Simulation Program..."
	$(CC) $(CFLAGS) $< $(LDFLAGS) -o $@
	@echo "Build successful: ./$@"

run: $(TARGET)
	@echo "Executing AWRL6844 Power-On BIST Full Pipeline Test (Stages 0..4)..."
	@./$(TARGET)

run-trace: $(TARGET)
	@echo "Executing AWRL6844 Power-On BIST with Debug Trace Dumps..."
	@./$(TARGET) --trace

run-stages: $(TARGET)
	@echo "Running individual stage tests..."
	@./$(TARGET) stage_mask=0x3
	@./$(TARGET) stage_mask=0x7
	@./$(TARGET) stage_mask=0xF
	@./$(TARGET) stage_mask=0x1F

# Check memory footprint with size utility if available
info: $(TARGET)
	@echo "=== Binary Section Information ==="
	@size $(TARGET) 2>/dev/null || echo "size utility not found"

# Run with Valgrind memory bounds checking (if installed on host)
memcheck: $(TARGET)
	valgrind --leak-check=full --show-leak-kinds=all --track-origins=yes ./$(TARGET)

clean:
	@rm -f $(TARGET)
	@echo "Cleaned build artifacts."

help:
	@echo "AWRL6844 BIST Build & Test Options:"
	@echo "  make              - Compiles the BIST simulation executable (bist_sim)"
	@echo "  make run          - Runs full 5-stage BIST self-test suite (Stages 0..4)"
	@echo "  make run-trace    - Runs with full per-stage input/output debug trace logs"
	@echo "  make run-stages   - Runs tests across incremental stage masks"
	@echo "  make info         - Displays binary size and memory section usage"
	@echo "  make clean        - Removes compiled binaries"
	@echo ""
	@echo "CLI Options for ./bist_sim directly:"
	@echo "  ./bist_sim stage=0,1             (Run specific stages 0 and 1)"
	@echo "  ./bist_sim stage_mask=0x3        (Run Stage 0 and 1 via bitmask)"
	@echo "  ./bist_sim stage_mask=0x7        (Run Stages 0, 1, 2)"
	@echo "  ./bist_sim stage_mask=0xF        (Run Stages 0, 1, 2, 3)"
	@echo "  ./bist_sim stage_mask=0x1F       (Run Stages 0, 1, 2, 3, 4)"
	@echo "  ./bist_sim --trace               (Dump input and output per stage)"
