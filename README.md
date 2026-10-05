# Moody Boards

디자인 공부 + 그림 작업을 위한 개인 작업 공간 (PWA). 모든 데이터는 브라우저(IndexedDB)에 저장되고, 인터넷 없이도 작동해요.

## 실행하기

`index.html`을 더블클릭하면 **작동하지 않아요** (모듈 방식이라 서버가 필요해요). 아래 중 하나로 여세요.

- **VS Code**: "Live Server" 확장 설치 → `index.html` 우클릭 → *Open with Live Server*
- **터미널**: 이 폴더에서 `python -m http.server 8000` → 브라우저에서 `http://localhost:8000`
- **온라인 공개**: 폴더째로 GitHub Pages / Netlify / Cloudflare Pages에 올리기 (https 필요)

## 데스크탑 앱으로 설치

크롬이나 엣지로 앱을 연 뒤, 주소창 오른쪽의 설치 아이콘(모니터 + 화살표)을 누르면 끝. 바탕화면/작업표시줄 아이콘이 생기고 앱 창으로 열려요.

## 이름 바꾸기

- **앱 안**: Settings → Names에서 앱 이름, 사용자 이름, 한 줄 소개를 언제든 바꿀 수 있어요.
- **기본값**: `js/config.js`
- **설치된 앱 아이콘 아래 이름**: `manifest.json`의 `name`, `short_name`

## 로고 / 아이콘 바꾸기

- `icons/icon.svg`: 사이드바 로고, 브라우저 탭 아이콘
- `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`: 설치 아이콘
- `icons/icon-alt-dark.svg`: 다른 버전(진한 배경 + 노란 별). 쓰고 싶으면 `icon.svg`와 이름을 바꾸면 돼요.

## 코드를 수정한 뒤

`sw.js` 맨 위의 `CACHE = 'moody-boards-v1'` 숫자를 올려주세요 (v2, v3…). 안 그러면 설치된 앱이 예전 파일을 계속 써요.

## 백업

Settings → Backup
- **Export everything**: 이미지까지 전부 파일 하나(.json)로 저장
- **Import a backup**: 그 파일로 전부 복원 (현재 데이터는 교체됨)
- **Automatic folder backup** (크롬/엣지): 폴더를 한 번 고르면 변경할 때마다 자동 저장. 구글 드라이브/원드라이브 동기화 폴더를 고르면 클라우드 백업 효과. 최근 14일치 보관.

## 단축키 (보드)

| 키 | 기능 |
|---|---|
| Ctrl+V | 이미지 / 링크 / 텍스트 붙여넣기 |
| Delete | 선택한 것 삭제 |
| Ctrl+Z | 실행 취소 |
| 방향키 (Shift) | 선택한 것 이동 |
| 더블클릭 | 메모·라벨 수정, 색 바꾸기, 출처 열기 |

## 파일 구조

```
index.html        앱 뼈대
manifest.json     설치용 정보 (이름, 아이콘, 색)
sw.js             오프라인 지원
css/styles.css    디자인 (색 변수는 맨 위 :root)
js/config.js      기본 이름 설정
js/db.js          저장 담당 (나중에 Firebase 붙일 때 이 파일만 바꾸면 됨)
js/app.js         페이지 이동
js/home.js        홈
js/projects.js    프로젝트 목록, 새 프로젝트, 완성작 선반
js/project.js     프로젝트 페이지 (체크리스트, 과정, 목업, 상세)
js/board.js       무드보드
js/palette.js     팔레트 탭
js/color.js       색 추출, 색 이름, 대비, 조화 규칙, 목적별 체크
js/data.js        템플릿, 팔레트 추천, 연습 주제
js/library.js     라이브러리
js/study.js       배운 것 카드, 피드백
js/practice.js    크로키, 주제 뽑기, 캘린더, 성장 비교
js/portfolio.js   포트폴리오 (HTML / PDF)
js/backup.js      백업
js/settings.js    설정
```
