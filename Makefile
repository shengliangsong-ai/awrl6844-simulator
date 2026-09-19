# =====================================================================================
# Texas Instruments AWRL6844 Power-On BIST DSP & HWA Verification Simulator Makefile
# Target: Host Native Simulator (GCC / Clang) & Embedded Cross-Compile Validation
# =====================================================================================

CC ?= gcc
CFLAGS ?= -O2 -Wall -Wextra -Werror -std=c99 -pedantic
LDFLAGS ?= -lm

SRC_DIR = bist
DOC_SRC = doc/awrl6844_bist_dsp_test.c
TARGET = bist_sim

.PHONY: all run clean help memcheck info

all: $(TARGET)

$(TARGET): $(DOC_SRC)
	@echo "Compiling AWRL6844 Power-On BIST DSP Simulation Program..."
	$(CC) $(CFLAGS) $< $(LDFLAGS) -o $@
	@echo "Build successful: ./$@"

run: $(TARGET)
	@echo "Executing AWRL6844 Power-On BIST Test Suite..."
	@./$(TARGET)

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
	@echo "AWRL6844 BIST Build Options:"
	@echo "  make         - Compiles the BIST simulation executable (bist_sim)"
	@echo "  make run     - Compiles and runs the BIST verification test suite"
	@echo "  make info    - Displays binary size and memory section usage"
	@echo "  make clean   - Removes compiled binaries"
