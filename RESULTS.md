# Results

## 1. 실험 요약
- 저장소: exp-three-webgpu-core
- 커밋 해시: b1120f1
- 실험 일시: 2026-05-20T15:46:04.270Z -> 2026-05-20T15:46:09.136Z
- 담당자: ai-webgpu-lab
- 실험 유형: `graphics`
- 상태: `success`

## 2. 질문
- three.js 계열 그래픽스 baseline으로 넘기기 전에 scene load와 frame pacing 보고 경로를 먼저 고정할 수 있는가
- capability probe와 fallback state가 graphics 결과 문서에 같이 남는가
- 실제 three.js 빌드 교체 전 deterministic scene harness로 반복 검증이 가능한가

## 3. 실행 환경
### 브라우저
- 이름: Chrome
- 버전: 147.0.7727.15

### 운영체제
- OS: Linux
- 버전: unknown

### 디바이스
- 장치명: Linux x86_64
- device class: `desktop-high`
- CPU: 16 threads
- 메모리: 32 GB
- 전원 상태: `unknown`

### GPU / 실행 모드
- adapter: navigator.gpu available
- backend: `webgpu`
- fallback triggered: `false`
- worker mode: `main`
- cache state: `warm`
- required features: ["shader-f16"]
- limits snapshot: {"maxTextureDimension2D":8192,"maxBindGroups":4}

## 4. 워크로드 정의
- 시나리오 이름: Three Scene Readiness
- 입력 프로필: 24-nodes-orbit-camera
- 데이터 크기: nodeCount=24; samples=96; backend=webgpu; fallback=false; automation=playwright-chromium, nodeCount=24; samples=96; backend=webgpu; fallback=false; realAdapter=fallback(renderer.renderAsync is not a function); automation=playwright-chromium
- dataset: -
- model_id 또는 renderer: three-webgpu-core-readiness
- 양자화/정밀도: -
- resolution: 960x540
- context_tokens: -
- output_tokens: -

## 5. 측정 지표
### 공통
- time_to_interactive_ms: 1782.8 ~ 2435.8 ms
- init_ms: 26.1 ~ 26.2 ms
- success_rate: 1
- peak_memory_note: 32 GB reported by browser
- error_type: -

### Graphics / Blackhole
- avg_fps: 60.35 ~ 60.66
- p95_frametime_ms: 17 ~ 17.8 ms
- scene_load_ms: 26.1 ~ 26.2 ms
- ray_steps: -
- taa states: undefined
- fallback states: false
- backends: webgpu

## 6. 결과 표
| Run | Scenario | Backend | Cache | Mean | P95 | Notes |
|---|---|---:|---:|---:|---:|---|
| 1 | Three Scene Readiness | webgpu | warm | 60.66 | 17.8 | scene_load=26.1 ms, fallback=false |
| 2 | Three Scene Readiness | webgpu | warm | 60.35 | 17 | scene_load=26.2 ms, fallback=false |

## 7. 관찰
- scene readiness baseline은 backend=webgpu, fallback_triggered=false로 기록됐다.
- graphics summary는 avg_fps=60.66, p95_frametime_ms=17.8, scene_load_ms=26.1였다.
- playwright-chromium로 수집된 automation baseline이며 headless=true, browser=Chromium 147.0.7727.15.
- 실제 runtime/model/renderer 교체 전 deterministic harness 결과이므로, 절대 성능보다 보고 경로와 재현성 확인에 우선 의미가 있다.

## 8. Real Adapter vs Deterministic
- adapter: real=three-webgpu-01600, deterministic=deterministic-three-style
- avg_fps: real=60.35, deterministic=60.66, delta=-0.31
- p95_frametime: real=17 ms, deterministic=17.8 ms, delta=-0.8 ms
- scene_load_ms: real=26.2 ms, deterministic=26.1 ms, delta=+0.1 ms

## 9. 결론
- three.js 계열 그래픽스 실험으로 넘어가기 전 scene readiness baseline과 결과 문서가 연결됐다.
- 다음 단계는 실제 three.js renderer를 붙이되 같은 graphics metric 구조를 유지하는 것이다.
- 브라우저별 capability/fallback 반복 측정이 더 쌓여야 library baseline 역할을 충분히 수행한다.

## 10. 첨부
- 스크린샷: ./reports/screenshots/01-three-scene-readiness.png, ./reports/screenshots/02-three-scene-real-three.png
- 로그 파일: ./reports/logs/01-three-scene-readiness.log, ./reports/logs/02-three-scene-real-three.log
- raw json: ./reports/raw/01-three-scene-readiness.json, ./reports/raw/02-three-scene-real-three.json
- 배포 URL: https://ai-webgpu-lab.github.io/exp-three-webgpu-core/
- 관련 이슈/PR: -
