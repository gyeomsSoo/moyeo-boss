# 동네모여: 사장님 방문용 사이트

**🔗 https://gyeomssoo.github.io/moyeo-boss/**

[동네모여](https://localmoyeo.kro.kr)는 제천 청년들이 관심사와 시간이 맞는 사람끼리 모임을 만들어 동네 가게로 함께 놀러 가게 해 주는 앱이에요. 문을 열기 전에 동네 가게 사장님들 이야기를 먼저 듣고 있고, 이 사이트는 그 방문에 써요.

가게에 QR을 보여 드리면 사장님이 휴대폰으로 바로 2분 설문에 답할 수 있어요.

<p><img src="img/qr.svg" width="140" alt="사장님 설문 QR"></p>

## 구조

| 경로 | 내용 |
|---|---|
| `index.html`, `css/`, `js/` | 사장님 2분 설문 (정적 페이지, 빌드 도구 없음) |
| `content/*.json` | 설문 문항과 안내 문구 |
| `app/` | 손님 화면 미리보기용 Flutter 웹 빌드 |
| `img/qr.svg`, `img/qr.png` | 설문 QR 코드 |

## 로컬에서 보기

```bash
python -m http.server 8000
# → http://localhost:8000
```

`main` 브랜치 루트가 GitHub Pages로 배포돼요.
