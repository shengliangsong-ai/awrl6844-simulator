export function hanning(size: number): number[] {
  const window = new Array(size);
  for (let i = 0; i < size; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return window;
}

/**
 * In-place Radix-2 Cooley-Tukey FFT
 * @param real Real part of the input array (modified in place)
 * @param imag Imaginary part of the input array (modified in place)
 * @param dir 1 for forward FFT, -1 for inverse FFT
 */
export function fft(real: number[], imag: number[], dir: 1 | -1 = 1) {
  const n = real.length;
  if ((n & (n - 1)) !== 0) throw new Error("FFT size must be a power of 2");

  let i, j, k, n1, n2, a, c, s, t1, t2;

  // Bit-reverse
  j = 0;
  for (i = 0; i < n - 1; i++) {
    if (i < j) {
      t1 = real[i]; real[i] = real[j]; real[j] = t1;
      t1 = imag[i]; imag[i] = imag[j]; imag[j] = t1;
    }
    k = n / 2;
    while (k <= j) {
      j -= k;
      k /= 2;
    }
    j += k;
  }

  // FFT
  n1 = 0;
  n2 = 1;
  for (i = 0; i < Math.log2(n); i++) {
    n1 = n2;
    n2 = n2 + n2;
    a = 0;
    for (j = 0; j < n1; j++) {
      c = Math.cos(a);
      s = dir * Math.sin(a);
      a += (Math.PI * 2) / n2;
      for (k = j; k < n; k += n2) {
        t1 = c * real[k + n1] - s * imag[k + n1];
        t2 = s * real[k + n1] + c * imag[k + n1];
        real[k + n1] = real[k] - t1;
        imag[k + n1] = imag[k] - t2;
        real[k] = real[k] + t1;
        imag[k] = imag[k] + t2;
      }
    }
  }
}

/**
 * 2D Cell-Averaging CFAR (Constant False Alarm Rate) Detection
 */
export function cfarCA(
  heatmap: number[][],
  trainCells: number,
  guardCells: number,
  thresholdDb: number
): { r: number; d: number; pwr: number }[] {
  const numRangeBins = heatmap.length;
  const numDopplerBins = heatmap[0].length;
  const detections = [];
  
  const winSize = trainCells + guardCells;

  for (let r = winSize; r < numRangeBins - winSize; r++) {
    for (let d = winSize; d < numDopplerBins - winSize; d++) {
      let noiseSum = 0;
      let cellCount = 0;

      // Sliding window over training cells (excluding guard cells and CUT)
      for (let i = -winSize; i <= winSize; i++) {
        for (let j = -winSize; j <= winSize; j++) {
          // Skip guard cells and Cell Under Test (CUT)
          if (Math.abs(i) <= guardCells && Math.abs(j) <= guardCells) continue;
          
          noiseSum += heatmap[r + i][d + j];
          cellCount++;
        }
      }

      const noiseAvg = noiseSum / cellCount;
      const cutPower = heatmap[r][d];

      // Since the heatmap is in log-magnitude (dB), we add the threshold
      if (cutPower > noiseAvg + thresholdDb) {
        // Simple local maxima check to prevent cluster-blooming
        let isLocalMax = true;
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            if (i === 0 && j === 0) continue;
            if (heatmap[r + i][d + j] >= cutPower) {
              isLocalMax = false;
              break;
            }
          }
        }
        
        if (isLocalMax) {
          detections.push({ r, d, pwr: cutPower });
        }
      }
    }
  }

  return detections;
}
