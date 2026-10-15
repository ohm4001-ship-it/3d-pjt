# 오픈소스 출처와 사용 범위

확인일: 2026-10-14

| 구성 | 출처 | 사용 범위 |
|---|---|---|
| Three.js | https://github.com/mrdoob/three.js · MIT | 실제 3D 렌더링·GLTF 로딩·GLB 출력 |
| Vite | https://github.com/vitejs/vite · MIT | 개발 서버·배포 빌드 |
| Playwright | https://github.com/microsoft/playwright · Apache-2.0 | 실제 브라우저 스모크 |
| TripoSR | https://github.com/VAST-AI-Research/TripoSR · https://huggingface.co/stabilityai/TripoSR · 코드/가중치 MIT | 단일 이미지의 외형 참고 메시 생성 |
| Whisper | https://github.com/openai/whisper · 코드/가중치 MIT | 로컬 음성 파일 전사 |
| scikit-image | https://github.com/scikit-image/scikit-image · BSD-3-Clause | Windows에서 TripoSR 밀도장 표면 추출 어댑터 |

TripoSR의 신경망 추론과 색상 조회는 공식 TSR 구현을 사용한다. 표면 추출만 scikit-image CPU 방식으로 대체했으며 공식 torchmcubes 실행기와 동일한 실행 환경이라고 주장하지 않는다. 공식 의자 예제는 연결 검증용이다. Whisper 공식 JFK fixture는 실제 전사 검증용이며 한국어 제작 요청 평가 자료는 아니다.

Python의 PyTorch, Transformers, Hugging Face Hub, rembg, ONNX Runtime, imageio-ffmpeg와 기타 전이 의존성에는 각각의 라이선스가 적용된다. 공개 배포 전 라이선스 목록·모델 버전과 체크섬을 확정한다. 설치 가중치, 외부 소스 체크아웃과 모델 테스트 미디어는 Git에 포함하지 않는다.

ERPNext, CadQuery는 다음 단계의 연동 후보이며 현재 구현에 포함하지 않았다. Hunyuan3D-2.1은 공식 허용 지역에 한국이 포함되지 않아 사용하지 않았다.
