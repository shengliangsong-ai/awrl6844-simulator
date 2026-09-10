# In-Cabin Radar Simulator Design Document

## 1. Architecture Overview
This application is a React-based 4-Seat In-Cabin Automotive Radar Simulator modeling the TI AWRL6844 60 GHz mmWave SoC. It transitions from Python/Streamlit (as in early specs) to a modern React + TypeScript + WebGL (Three.js) architecture for real-time in-browser visualization.

## 2. Physical Car Cabin Geometry
Coordinates are defined with +Y pointing FRONT, +X pointing RIGHT, and +Z pointing UP.

### Seat Centers
* **Front Left (FL)**: `(-0.4, 0.7, -0.2)`
* **Front Right (FR)**: `(0.4, 0.7, -0.2)`
* **Back Left (BL)**: `(-0.36, 1.35, -0.2)`
* **Back Right (BR)**: `(0.36, 1.35, -0.2)`

### Sensor Mounting Positions
* **Roof-Center**: `(0.00, 0.00, 1.25)`
* **Windshield**: `(0.00, 0.85, 1.15)`
* **B-Pillar**: `(-0.75, 0.00, 0.90)`

## 3. Occupant Modeling (Multi-Point Scattering)
The simulator uses Multi-Point Body-Frame Scattering Clusters to mimic physical proportions.

### Adult (6 Scatterers)
Offsets from seat center:
* **Torso**: `(0.0, 0.0, 0.0)` | RCS: 0.40 | Breath: 1.0mm @ 15 BPM
* **Head**: `(0.0, 0.0, 0.45)` | RCS: 0.15
* **Left Shoulder**: `(-0.18, 0.0, 0.25)` | RCS: 0.15 | Breath: 0.2mm
* **Right Shoulder**: `(0.18, 0.0, 0.25)` | RCS: 0.15 | Breath: 0.2mm
* **Left Knee**: `(-0.15, 0.35, -0.20)` | RCS: 0.075
* **Right Knee**: `(0.15, 0.35, -0.20)` | RCS: 0.075

### Infant (2 Scatterers)
Offsets from seat center:
* **Torso**: `(0.0, 0.0, 0.0)` | RCS: 0.15 | Breath: 0.25mm @ 42 BPM
* **Head**: `(0.0, -0.05, 0.15)` | RCS: 0.05

## 4. UI and 3D Visualization
* **Tesla Model Y 3D Cabin Canvas**: WebGL wireframe interior, including steering wheel, dashboard, and roofline.
* **Bounding Boxes**: Highlight occupied seats (Blue for Adult, Pink for Child) with confidence metrics.
* **Direction Indicator**: Neon green arrow pointing FRONT (+Y).
* **Sensor Indicator**: Red sphere at the active sensor mount position.