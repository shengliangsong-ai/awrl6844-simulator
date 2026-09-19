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

.PHONY: all run run-stages run-trace run-bin verify-qspi clean help memcheck info

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

run-bin: $(TARGET)
	@echo "Executing AWRL6844 Power-On BIST with Compact QSPI Flash Binary Dumps..."
	@./$(TARGET) stage_mask=0x1F --bin
	@python3 scripts/compare_qspi_flash.py --verify-sim

verify-qspi: $(TARGET)
	@python3 scripts/compare_qspi_flash.py --verify-sim

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
	@rm -f $(TARGET) stage0_adc_trace.log stage1_fft_trace.log stage2_doppler_trace.log stage3_cfar_trace.log stage4_clustering_trace.log
	@rm -f stage0_adc_in.bin stage1_fft_out.bin stage2_doppler_out.bin stage3_cfar_out.bin stage4_clusters_out.bin awrl6844_bist_qspi_dump.bin
	@echo "Cleaned build artifacts, trace log files, and QSPI binary dumps."

help:
	@echo "AWRL6844 BIST Build & Test Options:"
	@echo "  make              - Compiles the BIST simulation executable (bist_sim)"
	@echo "  make run          - Runs full 5-stage BIST self-test suite (Stages 0..4)"
	@echo "  make run-trace    - Runs with full per-stage input/output debug trace logs"
	@echo "  make run-bin      - Generates compact QSPI flash binary dumps and verifies them"
	@echo "  make verify-qspi  - Runs python QSPI flash binary parser and verification"
	@echo "  make run-stages   - Runs tests across incremental stage masks"
	@echo "  make info         - Displays binary size and memory section usage"
	@echo "  make clean        - Removes compiled binaries, logs, and bin dumps"
	@echo ""
	@echo "CLI Options for ./bist_sim directly:"
	@echo "  ./bist_sim stage=0,1             (Run specific stages 0 and 1)"
	@echo "  ./bist_sim stage_mask=0x3        (Run Stage 0 and 1 via bitmask)"
	@echo "  ./bist_sim stage_mask=0x7        (Run Stages 0, 1, 2)"
	@echo "  ./bist_sim stage_mask=0xF        (Run Stages 0, 1, 2, 3)"
	@echo "  ./bist_sim stage_mask=0x1F       (Run Stages 0, 1, 2, 3, 4)"
	@echo "  ./bist_sim --trace               (Dump human-readable log files)"
	@echo "  ./bist_sim --bin                 (Generate compact QSPI flash binary dumps)"
	@echo "  ./bist_sim --trace --bin         (Generate both text logs and binary dumps)"
	@echo ""
	@echo "Python QSPI Hardware Comparator:"
	@echo "  python3 scripts/compare_qspi_flash.py --sim-dir . --hw-dir /path/to/hw_dumps"

