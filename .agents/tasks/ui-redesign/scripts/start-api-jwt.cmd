@echo off
cd /d c:\Users\analistabi2\Desarrollo\control-phari\.worktrees\ui-redesign
set AUTH_MODE=jwt
set JWT_SECRET=bef4e24c43e3ff16197b7743e6afcea706789400668d036c
npm run start --workspace apps/api > c:\Users\analistabi2\Desarrollo\control-phari\.agents\tasks\ui-redesign\scripts\api.log 2>&1
