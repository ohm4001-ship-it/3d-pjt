# 로컬 AI 모델 실행

이미지는 **실제 TripoSR 추론 → 정점 색상이 있는 GLB**, 오디오 파일은 **실제 Whisper 추론 → 전사 JSON**으로 처리한다. 의존성이나 가중치가 없으면 작업이 명시적으로 실패한다. 임의의 기본 모델/문장을 AI 결과로 대체하지 않는다.

치수 기반 진열대와 이미지 기반 시안은 용도가 다르다. TripoSR 결과는 고객과 외형을 논의하기 위한 참고 모델이며, 실측 치수·부품 규격·BOM·제작 공차를 보증하지 않는다.

## 실행 조건

- 프로젝트 안의 `model-service/.venv` 사용. 전역 Python 패키지를 수정하지 않는다.
- Python 3.12.12 기준 의존성을 고정했다. 실제 설치·추론 결과는 작업 기록에 남긴다.
- Whisper는 Python 3.12를 명시적으로 지원하는 `20250625` 릴리스다. 오래된 `20240930`의 setuptools/pkg_resources 빌드 문제를 피한다.
- Transformers `4.45.2`, tokenizers `0.20.3`, Hugging Face Hub `0.26.2`를 사용한다. TripoSR가 호출하는 ViT config/forward API는 유지되며, tokenizers의 Windows Python 3.12 wheel을 사용할 수 있다. 원본의 오래된 tokenizers 소스 빌드를 피하기 위한 호환 버전이다.
- 이미지: NVIDIA CUDA GPU 필요. 확인된 장비는 RTX 4070 Laptop, VRAM 8,188MiB, 드라이버 591.44다. 공식 기본 설정은 단일 이미지 약 6GB VRAM을 사용한다. 이 어댑터는 메쉬 해상도 128, 청크 4,096으로 시작한다. 다른 앱의 GPU 사용량에 따라 메모리가 부족할 수 있다.
- 오디오: GPU가 있으면 CUDA, 없으면 CPU를 사용한다. 기본 모델은 다국어 `base`다.
- 처음 설치할 때 GitHub, PyTorch 패키지 서버, PyPI, Hugging Face, U2Net·Whisper 가중치 배포 서버에 접근해야 한다. 추론 작업은 로컬 파일을 사용하며 Hugging Face 다운로드를 막는다.
- FFmpeg는 `imageio-ffmpeg` 패키지가 제공하는 프로젝트 내 바이너리를 사용한다. 시스템 FFmpeg 설치는 필수가 아니다.

## PowerShell 설치

아래 명령은 **formworks 폴더**에서 실행한다. CUDA PyTorch 설치는 약 수 GB의 다운로드·디스크 공간을 사용한다. 패키지 설치는 동시에 실행하지 않는다.

```powershell
New-Item -ItemType Directory -Force model-service/.tmp | Out-Null
$modelTemp = (Resolve-Path model-service/.tmp).Path
$env:TEMP = $modelTemp
$env:TMP = $modelTemp
python -m venv model-service/.venv
.\model-service\.venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
git clone --depth 1 https://github.com/VAST-AI-Research/TripoSR.git model-service/vendor/TripoSR
git -C model-service/vendor/TripoSR checkout 107cefdc244c39106fa830359024f6a2f1c78871
.\model-service\.venv\Scripts\python.exe -m pip install torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cu124
.\model-service\.venv\Scripts\python.exe -m pip install --only-binary=tokenizers -r model-service/requirements.txt
.\model-service\.venv\Scripts\python.exe model-service/download_models.py --image --audio
```

이미 clone된 `vendor/TripoSR`가 있으면 clone을 반복할 필요가 없다. 로컬 venv 생성 중 `ensurepip`가 임시 경로 권한 오류로 실패한 경우 프로젝트의 TEMP/TMP 설정 후 아래 명령으로 복구할 수 있다.

```powershell
.\model-service\.venv\Scripts\python.exe -m ensurepip --upgrade --default-pip
```

원본 TripoSR는 `torchmcubes`라는 C++/CUDA 확장을 사용한다. 이 프로젝트는 Windows에서 별도의 MSVC 빌드를 피하기 위해 **메쉬 표면 추출만 scikit-image CPU marching cubes로 바꾼 어댑터**를 사용한다. 이미지 인코더·TripoSR 신경망·밀도·정점 색상 추론은 공식 upstream `TSR` API와 실제 CUDA 모델을 사용한다. upstream 소스는 수정하지 않는다. `Gradio`, `xatlas`, `ModernGL`은 현재 GLB 경로에서 사용하지 않아 설치하지 않는다.

## 준비 상태 확인

```powershell
.\model-service\.venv\Scripts\python.exe model-service/generate.py --check
.\model-service\.venv\Scripts\python.exe model-service/transcribe.py --check
```

표준 출력은 `{ "ready": true/false, "provider": "...", "reasons": [...] }` JSON이다. `ready`는 현재 의존성·로컬 가중치·장비 조건을 확인하는 상태이며, 새 입력의 품질이나 추론 성공을 보장하지 않는다. 실제 GLB 생성 스모크 테스트를 함께 확인해야 한다. 진단 메시지는 표준 오류로 전달한다.

## 이미지 → GLB

```powershell
.\model-service\.venv\Scripts\python.exe model-service/generate.py --input "C:\absolute\object.png" --output "C:\absolute\object.glb"
```

- 단일 물체가 명확한 사진을 사용한다. 투명 PNG는 배경 제거를 건너뛴다. 일반 사진은 로컬 U2Net으로 배경을 제거한다.
- 기본 해상도 128은 시연과 메모리 조건을 위한 선택이다. `--resolution 256`은 더 세밀하지만 추론 시간·메모리를 늘린다.
- 필요하면 `--chunk-size 2048`로 밀도·색상 쿼리의 메모리를 줄인다.
- GLB를 Y-up으로 회전해 웹 뷰어에서 바로 표시할 수 있도록 했다.
- 성공 시 종료 코드 0, 지정한 GLB 파일, 모델·정점·면·시간·GPU 정보 JSON을 반환한다. 실패 시 종료 코드 1과 읽을 수 있는 오류를 반환하며 완성 출력 파일을 생성하지 않는다.

## 오디오 파일 → 전사

```powershell
.\model-service\.venv\Scripts\python.exe model-service/transcribe.py --input "C:\absolute\request.wav" --output "C:\absolute\transcript.json" --language ko
```

- WAV·MP3·WebM 등 로컬 FFmpeg가 디코딩하는 파일을 지원한다.
- 최대 120초. 긴 파일은 명시적으로 거부한다.
- `--language ko`로 한국어를 지정할 수 있다. 옵션을 생략하면 언어를 감지한다.
- 결과에는 원문·언어·구간별 시간·모델·오디오 길이가 포함된다. 전사한 치수는 사용자가 확인한 후 견적에 반영한다.
- `small` 모델 사용 시 `download_models.py --audio --whisper-model small`로 별도 준비하고 `transcribe.py --model small`로 실행한다.

## 저장과 라이선스

`model-service/.cache`에 Hugging Face 캐시, TripoSR config/weights, U2Net, Whisper, 다운로드 파일 해시 목록을 저장한다. `.venv`, `.cache`, `.tmp`, upstream clone은 모두 Git에서 제외한다. 대형 파일이나 사용자 입력을 저장소에 커밋하지 않는다.

TripoSR 공식 저장소와 모델 카드는 코드·가중치 MIT를 명시한다. Whisper 코드·가중치도 MIT다. 코드 재배포 시 저작권·라이선스 고지를 보존하고, 패키지·FFmpeg·학습 데이터 라이선스는 별도로 관리해야 한다. 각 패키지가 모두 MIT라는 의미는 아니다.

- [TripoSR 공식 저장소/설치/VRAM 설명](https://github.com/VAST-AI-Research/TripoSR)
- [TripoSR Hugging Face 모델 카드](https://huggingface.co/stabilityai/TripoSR)
- [Whisper 공식 저장소](https://github.com/openai/whisper)
- [PyTorch 설치 안내](https://pytorch.org/get-started/locally/)
- [scikit-image marching cubes 문서](https://scikit-image.org/docs/stable/api/skimage.measure.html#skimage.measure.marching_cubes)

## 검증 기록

2026-10-14 초기 점검에서 GPU·CUDA 드라이버를 확인했다. venv 생성은 임시 경로 권한 오류를 프로젝트 TEMP/TMP 설정으로 해결했다. 기본 sandbox의 GitHub 접근은 DNS 해석 단계에서 막혔으며, root 작업에서 승인된 네트워크 경로로 upstream clone에 성공했다. 의존성 설치 전 두 `--check`가 `ready:false`와 구체적 부족 항목을 반환했고, Python 문법 검사를 통과했다.

2026-10-14 **실제 모델 CLI 스모크를 통과했다**. TripoSR는 RTX 4070 Laptop CUDA에서 chair 입력을 10.09초에 10,224정점·20,448면·410,068byte GLB로 생성했다. 재로드한 GLB의 유한한 좌표와 충분한 면 수를 확인했다. PyTorch가 기록한 최대 GPU 할당 메모리는 1,957,210,624byte(약 1.82GiB)였다. 이 숫자는 해당 해상도 128 fixture의 측정값이며, 전체 GPU 점유량이나 모든 입력의 메모리 요구량을 뜻하지 않는다.

Whisper 다국어 base는 11초의 공식 영어 speech fixture를 CUDA에서 2.78초에 전사하고 예상 내용을 복구했다. 이 결과로 한국어 치수 인식 정확도를 주장하지 않는다. 정상 로컬 실행과 동일한 승인된 실행 환경에서 테스트했으며, 제한된 sandbox에서 내려받은 fixture를 읽으려던 최초 실행은 WinError 5로 거부되어 실제 추론까지 진행하지 못했다.

실제 모델 원본 가중치는 모두 프로젝트 내부에 내려받았고 파일 크기·SHA256을 `.cache/download-manifest.json`에 기록했다. 첫 모델 실행의 Transformers offline cache marker 경고에도 실제 추론은 성공했다. 재설치 경로에는 다운로드 단계에서 캐시 초기화를 추가했다.

브라우저/API 통합 스모크 결과는 [PROGRESS.md](PROGRESS.md)와 [model-api-smoke.json](verification/model-api-smoke.json)의 최종 기록을 기준으로 한다. CLI 추론 통과를 브라우저·전체 업무 흐름 검증으로 확대하지 않는다.

실제 모델 재검증 명령은 아래와 같다. 오디오 fixture는 [Whisper 공식 테스트 파일](https://github.com/openai/whisper/blob/main/tests/jfk.flac)을 `model-service/smoke-output/jfk.flac`에 준비한다. 테스트는 이 파일을 WAV로 변환하고, 실제 전사에서 예상 내용이 복구되는지 확인한다. 이미지는 upstream chair 예제를 사용한다.

```powershell
.\model-service\.venv\Scripts\python.exe model-service/smoke.py --audio model-service/smoke-output/jfk.flac
```

성공 시 `model-service/smoke-output/report.json`에 실제 출력 크기·정점/면 수·GPU 최대 할당 메모리·추론 시간·전사 결과·fixture 출처를 남긴다. GLB를 다시 읽어 유한한 좌표와 최소 100개 이상의 면을 검증한다. 이 검증은 출력 파일·실제 추론 성공을 확인하며, 진열대 사진의 재구성 품질이나 한국어 치수 전사의 정확도를 측정하는 평가는 아니다.
