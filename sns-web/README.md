# Vercel 서버 로그인 설정 (무료)

1. Vercel 프로젝트 → Storage 탭 → Create Database → Upstash (Redis) → Free 플랜으로 만들고 이 프로젝트에 Connect.
   환경변수(KV_REST_API_URL, KV_REST_API_TOKEN)가 자동으로 들어갑니다.
2. 저장소에 이 폴더(api/auth.js 포함)를 올리면 자동 재배포됩니다. 환경변수는 재배포 후 적용됩니다.
3. 사이트에서 가입하면 연결 코드가 자동으로 만들어져 확장에 설정됩니다. (확장 v0.11.0 이상)
