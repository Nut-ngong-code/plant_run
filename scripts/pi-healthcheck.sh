#!/usr/bin/env bash
# ตรวจสุขภาพระบบบน Raspberry Pi — อ่านอย่างเดียว ไม่แก้ไขอะไรทั้งสิ้น รันได้ทุกเมื่อ
#
# ใช้:   bash ~/final-project/scripts/pi-healthcheck.sh
# ย่อ:   echo "alias plantcheck='bash ~/final-project/scripts/pi-healthcheck.sh'" >> ~/.bashrc
#
# ออกด้วย exit code 0 = ปกติทุกข้อ, 1 = มีข้อที่ล้มเหลว (เอาไปใช้กับ cron/แจ้งเตือนได้)

set -uo pipefail    # ไม่ใส่ -e เพราะต้องการให้ตรวจครบทุกข้อแม้บางข้อพัง

FAILED=0
WARNED=0
ok()   { echo "  ✅ $*"; }
warn() { echo "  ⚠️  $*"; WARNED=$((WARNED+1)); }
bad()  { echo "  ❌ $*"; FAILED=$((FAILED+1)); }
head_() { echo; echo "── $* ────────────────────────────"; }

echo "======================================================"
echo " ตรวจสุขภาพระบบ Plant Watering — $(date '+%F %H:%M:%S')"
echo "======================================================"

head_ "1. พื้นที่เก็บฐานข้อมูล (SSD)"
SSD_SRC="$(findmnt -n -o SOURCE /mnt/ssd 2>/dev/null)"
if [ -n "$SSD_SRC" ]; then
  ok "/mnt/ssd mount อยู่กับ $SSD_SRC ($(df -h /mnt/ssd | tail -1 | awk '{print $4}') ว่าง)"
else
  bad "/mnt/ssd ไม่ได้ mount — ฐานข้อมูลกำลังเขียนลง SD card (เสี่ยงการ์ดพัง)"
  echo "     แก้: lsblk -f  แล้วเทียบ UUID กับ /etc/fstab จากนั้น sudo mount -a"
fi

FSTAB_N="$(grep -c '[[:space:]]/mnt/ssd[[:space:]]' /etc/fstab 2>/dev/null || echo 0)"
if [ "$FSTAB_N" -eq 1 ]; then
  ok "/etc/fstab มีบรรทัดของ /mnt/ssd บรรทัดเดียว"
elif [ "$FSTAB_N" -eq 0 ]; then
  warn "/etc/fstab ไม่มีบรรทัดของ /mnt/ssd — SSD จะไม่ mount เองตอนบูต"
else
  bad "/etc/fstab มีบรรทัดของ /mnt/ssd ซ้ำ $FSTAB_N บรรทัด — systemd จะยึดบรรทัดแรกและมองข้ามที่เหลือ"
  grep -n '[[:space:]]/mnt/ssd[[:space:]]' /etc/fstab | sed 's/^/     /'
fi

head_ "2. ฐานข้อมูล (Docker)"
DB_STATUS="$(docker ps -a --filter name=plant_mysql_db --format '{{.Status}}' 2>/dev/null)"
case "$DB_STATUS" in
  *healthy*)  ok "plant_mysql_db: $DB_STATUS" ;;
  Up*)        warn "plant_mysql_db ขึ้นแล้วแต่ยังไม่ healthy: $DB_STATUS (ถ้าเพิ่งบูตให้รออีก 1-2 นาที)" ;;
  "")         bad "ไม่พบ container plant_mysql_db เลย"
              echo "     แก้: cd ~/final-project/database && docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d" ;;
  *)          bad "plant_mysql_db ไม่ได้ทำงาน: $DB_STATUS" ;;
esac

DB_MOUNT="$(docker inspect plant_mysql_db --format '{{range .Mounts}}{{.Source}}{{end}}' 2>/dev/null)"
[ -n "$DB_MOUNT" ] && echo "     datadir ผูกกับ: $DB_MOUNT"

head_ "3. Backend (systemd)"
if systemctl is-active --quiet plant-backend; then
  ok "plant-backend: active ($(systemctl show -p ActiveEnterTimestamp --value plant-backend))"
else
  bad "plant-backend: $(systemctl is-active plant-backend)"
  echo "     ดูสาเหตุ: journalctl -u plant-backend -n 30 --no-pager"
fi

UNIT_USER="$(grep -m1 '^User=' /etc/systemd/system/plant-backend.service 2>/dev/null | cut -d= -f2)"
ME="$(id -un)"
if [ -z "$UNIT_USER" ]; then
  warn "ไม่พบบรรทัด User= ใน unit"
elif [ "$UNIT_USER" = "$ME" ]; then
  ok "unit User=$UNIT_USER ตรงกับผู้ใช้บนเครื่อง"
else
  bad "unit User=$UNIT_USER แต่ผู้ใช้บนเครื่องคือ $ME → จะได้ status=217/USER"
  echo "     แก้: sudo sed -i \"s|^User=.*|User=$ME|\" /etc/systemd/system/plant-backend.service && sudo systemctl daemon-reload && sudo systemctl restart plant-backend"
fi

head_ "4. Prisma Client"
if ls -d "$HOME"/final-project/backend/node_modules/.pnpm/@prisma+client*/node_modules/.prisma/client >/dev/null 2>&1; then
  ok "generate ไว้แล้ว"
else
  bad "ไม่พบ .prisma/client → backend จะตายด้วย \"@prisma/client did not initialize yet\""
  echo "     แก้: cd ~/final-project/backend && pnpm exec prisma generate"
fi

head_ "5. เว็บ + API"
HEALTH="$(curl -sS -m 10 http://localhost:3000/health 2>/dev/null)"
if echo "$HEALTH" | grep -q '"ok":true'; then
  ok "localhost:3000/health → $HEALTH"
else
  bad "localhost:3000/health ไม่ตอบ"
fi

TS_DNS="$(tailscale status --json 2>/dev/null | python3 -c "import sys,json;print(json.load(sys.stdin)['Self']['DNSName'].rstrip('.'))" 2>/dev/null)"
if [ -n "$TS_DNS" ]; then
  CODE="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "https://$TS_DNS/health" 2>/dev/null)"
  case "$CODE" in
    200) ok "https://$TS_DNS/health → 200" ;;
    502) bad "https://$TS_DNS/health → 502 (Funnel ปกติ แต่ backend ไม่ตอบ)" ;;
    *)   bad "https://$TS_DNS/health → $CODE" ;;
  esac
  echo "     เปิดเว็บด้วย https://$TS_DNS  (ต้องมี https:// และห้ามใส่ :3000)"
else
  warn "อ่านชื่อโดเมนจาก tailscale ไม่ได้ — ข้ามการตรวจ Funnel"
fi

# MQTT — ESP32 รับคำสั่งผ่านช่องนี้ (backend ฟังที่ 1883 · Funnel เปิดออกที่ 8443)
if timeout 3 bash -c '</dev/tcp/127.0.0.1/1883' 2>/dev/null; then
  ok "MQTT broker ฟังที่ localhost:1883"
else
  bad "MQTT broker ไม่ฟังที่ 1883 → ESP32 รับคำสั่งไม่ได้ (ดู MQTT_PORT ใน .env / log ของ backend)"
fi
if tailscale funnel status 2>/dev/null | grep -q '8443'; then
  ok "Funnel เปิด MQTT ที่ :8443"
else
  bad "Funnel ยังไม่เปิดพอร์ต 8443 ให้ MQTT"
  echo "     แก้: sudo tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883"
fi

head_ "6. ข้อมูลในฐานข้อมูล"
if [ -n "$DB_STATUS" ] && echo "$DB_STATUS" | grep -q '^Up'; then
  docker exec plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db -N -B -e \
    "SELECT CONCAT('     ผู้ใช้ ', COUNT(*), ' คน') FROM USER;
     SELECT CONCAT('     กระถาง ', COUNT(*), ' ใบ') FROM DEVICE;
     SELECT CONCAT('     บันทึกวิ่ง ', COUNT(*), ' รายการ') FROM RUN_HISTORY;
     SELECT CONCAT('     บันทึกความชื้น ', COUNT(*), ' แถว') FROM SOIL_LOG;" 2>/dev/null
  LAST="$(docker exec plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db -N -B -e \
    "SELECT IFNULL(MIN(TIMESTAMPDIFF(SECOND,last_seen_at,NOW())), -1) FROM DEVICE;" 2>/dev/null)"
  if [ -z "$LAST" ] || [ "$LAST" = "-1" ] || [ "$LAST" = "NULL" ]; then
    warn "ESP32 ยังไม่เคยติดต่อเข้ามา (last_seen_at ว่าง) — token ในบอร์ดอาจไม่ตรงกับฐานปัจจุบัน"
  elif [ "$LAST" -lt 60 ]; then
    ok "ESP32 ติดต่อล่าสุด $LAST วินาทีที่แล้ว (ONLINE)"
  else
    warn "ESP32 ติดต่อล่าสุด $LAST วินาทีที่แล้ว (OFFLINE)"
  fi
else
  warn "ข้ามการตรวจข้อมูล เพราะฐานข้อมูลไม่ได้ทำงาน"
fi

head_ "7. ทรัพยากรเครื่อง"
free -h | awk 'NR==2 {print "     RAM: ใช้ " $3 " / " $2 "  เหลือใช้ได้ " $7}'
df -h / | awk 'NR==2 {print "     SD card: ใช้ " $5 " (" $3 "/" $2 ")"}'
[ -n "$SSD_SRC" ] && df -h /mnt/ssd | awk 'NR==2 {print "     SSD: ใช้ " $5 " (" $3 "/" $2 ")"}'
SWAP_ON="$(swapon --show=NAME --noheadings 2>/dev/null | tr '\n' ' ')"
echo "     swap: ${SWAP_ON:-ไม่มี}"

echo
echo "======================================================"
if [ "$FAILED" -eq 0 ] && [ "$WARNED" -eq 0 ]; then
  echo " ผลรวม: ปกติทุกข้อ ✅"
elif [ "$FAILED" -eq 0 ]; then
  echo " ผลรวม: ใช้งานได้ แต่มีข้อควรดู $WARNED ข้อ ⚠️"
else
  echo " ผลรวม: มีปัญหา $FAILED ข้อ ❌ (คำเตือนอีก $WARNED ข้อ)"
fi
echo "======================================================"
[ "$FAILED" -eq 0 ]
