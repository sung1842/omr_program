# 롤백

로컬 전용. GitHub에 올리지 않음.

- 태그: `savepoint-pre-form-wizard`
- 의미: 양식 마법사 기능 착수 직전 `main` (당시 origin/main과 동일)

기능 개발이 배포본을 망가뜨린 것 같으면 사용자에게 확인한 뒤:

```
git switch main
git reset --hard savepoint-pre-form-wizard
```

진행 중 브랜치: `feature/form-wizard`
