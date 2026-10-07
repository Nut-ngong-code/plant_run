# ติดตั้งระบบบน VirtualBox (เครื่องแม่ข่ายสำรองบนโน้ตบุ๊ก) + Tailscale Funnel

> ใช้เมื่อ Raspberry Pi ใช้งานไม่ได้ (2026-10: Pi บูตไม่ขึ้นหลังไฟตกต่อเนื่อง) — ย้ายระบบมารันใน VM บนโน้ตบุ๊กชั่วคราว
>
> **หัวใจของคู่มือนี้**: ตั้งชื่อเครื่องใน Tailscale เป็น `respi` เหมือนเดิม → URL ยังเป็น `https://respi.<tailnet>.ts.net`
> → **ESP32 ไม่ต้องแก้อะไร** (Server URL เดิม + token เดิมซึ่ง hash อยู่ใน dump) · **Strava ไม่ต้องแก้ Callback Domain** · `.env` ใช้ URL เดิม
>
> ใช้เวลาราว 2–3 ชั่วโมง · ต้องมีไฟล์ dump ของฐานข้อมูล (`backup-YYYY-MM-DD.sql`) อยู่บนโน้ตบุ๊ก

## สิ่งที่ต้องยอมรับ

- **โน้ตบุ๊กต้องเปิดอยู่และห้าม sleep** ตลอดช่วงที่ต้องการให้ระบบออนไลน์ (ขั้นที่ 10)
- พกโน้ตบุ๊กไปที่ไหนก็ได้ — Funnel ใช้ได้ทุกเครือข่าย ESP32 ที่บ้านยังต่อได้ ขอแค่โน้ตบุ๊กมีเน็ต
- VM ใช้เครือข่ายแบบ **NAT** พอ — Funnel ต่อจาก VM ออกไปข้างนอกเอง ไม่ต้องเปิดพอร์ตใด ๆ ที่เราเตอร์หรือ Windows Firewall

---

## ขั้นที่ 1 — ติดตั้ง VirtualBox + โหลด Ubuntu Server

1. ติดตั้ง **VirtualBox 7.x** จาก https://www.virtualbox.org/wiki/Downloads (Windows hosts)
2. โหลด **Ubuntu Server 24.04 LTS** (ไฟล์ `ubuntu-24.04.x-live-server-amd64.iso`) จาก https://ubuntu.com/download/server

> เครื่องที่เปิด WSL2/Hyper-V อยู่ VirtualBox จะทำงานผ่าน Hyper-V (มุมขวาล่างของหน้าต่าง VM เป็นรูปเต่าสีเขียว) — ช้าลงบ้างแต่ระบบนี้เบา ใช้ได้

## ขั้นที่ 2 — สร้าง VM

VirtualBox → **New**

| ช่อง | ค่า |
|---|---|
| Name | `plant-server` (คู่มือนี้อ้างชื่อนี้ในคำสั่ง VBoxManage) |
| ISO Image | ไฟล์ Ubuntu Server ที่โหลดมา |
| **Skip Unattended Installation** | ✅ ติ๊ก (ติดตั้งเองในขั้นที่ 3) |
| Base Memory | **4096 MB** |
| Processors | **2** |
| Hard Disk | **25 GB** (VDI, Dynamically allocated) |

ก่อนเปิดเครื่อง → **Settings → Network → Adapter 1**: Attached to **NAT** → **Advanced → Port Forwarding** → เพิ่มกฎ:

| Name | Protocol | Host IP | Host Port | Guest Port |
|---|---|---|---|---|
| ssh | TCP | 127.0.0.1 | 2222 | 22 |

## ขั้นที่ 3 — ติดตั้ง Ubuntu Server

Start → ทำตามตัวติดตั้ง ใช้ค่าเริ่มต้นได้เกือบทั้งหมด:
- Network: DHCP (ค่าเริ่มต้น) · Storage: **Use an entire disk** (เป็นดิสก์เสมือน ไม่กระทบเครื่องจริง)
- Profile: Your name ตามสะดวก · Server name `plant-server` · **Username `plant`** (คู่มือนี้อ้างชื่อนี้)
- ✅ **Install OpenSSH server**
- Featured snaps: ไม่ต้องเลือกอะไร

ติดตั้งเสร็จ → **Reboot Now** (ถ้าค้างที่ "Please remove the installation medium" ให้ Devices → Optical Drives → Remove disk แล้วกด Enter)

## ขั้นที่ 4 — SSH เข้า VM

ใช้ **PowerShell หรือ Windows Terminal** (ไม่ใช่ WSL — `127.0.0.1` ใน WSL ไม่ใช่เครื่อง Windows):
```powershell
ssh -p 2222 plant@127.0.0.1
```

## ขั้นที่ 5 — ติดตั้งโปรแกรม

```bash
sudo apt-get update && sudo apt-get upgrade -y

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER

# Node 20 + git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git

# pnpm 10 — ห้ามใช้ 11 (เลิกอ่าน onlyBuiltDependencies ใน package.json → Prisma ไม่ generate — ระบบบน Pi เคยล่มเพราะเรื่องนี้)
sudo npm install -g pnpm@10

exit
```
ssh เข้าใหม่ (ให้สิทธิ์กลุ่ม docker มีผล) แล้วตรวจ:
```bash
docker ps        # ไม่ error เรื่อง permission
node -v          # v20.x
pnpm -v          # 10.x
```

## ขั้นที่ 6 — ดึงโค้ด + เปิดฐานข้อมูล

```bash
git clone https://github.com/Nut-ngong-code/plant_run.git ~/final-project
cd ~/final-project && git checkout main      # MQTT merge เข้า main แล้ว (ae8e3c8) — ห้ามอยู่ feat/mqtt: branch นั้นหยุดอัปเดตแล้ว git pull จะไม่ได้ของใหม่

cd database && docker compose up -d --build       # ใช้ docker-compose.yml ตัวหลัก — ไม่ใช่ .pi.yml (ตัวนั้นชี้ /mnt/ssd)
docker ps                                          # plant_mysql_db ต้อง Up
```
> ถ้า repo เป็น private: `git clone` จะถาม username/password — ใส่ username GitHub และใช้ **Personal Access Token** แทนรหัสผ่าน (GitHub → Settings → Developer settings → Tokens)

## ขั้นที่ 7 — นำข้อมูลเข้า

บน **PowerShell ของ Windows** ส่งไฟล์ dump เข้า VM (`-P` ตัวใหญ่):
```powershell
scp -P 2222 C:\path\to\backup-2026-xx-xx.sql plant@127.0.0.1:~/
```
บน VM — รอ MySQL พร้อมราว 30 วิหลัง `compose up` ครั้งแรก แล้ว:
```bash
docker exec -i plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db < ~/backup-2026-xx-xx.sql

# ตรวจ — ต้องเห็นผู้ใช้จริงพร้อมแต้มเดิม และ POT-001
docker exec plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db \
  -e 'SELECT id, display_name, total_points FROM `USER`; SELECT device_id, display_name FROM DEVICE;'
```
> ข้อมูลทดสอบที่ `init.sql` สร้างตอนเปิดฐานครั้งแรกจะถูกแทนที่ทั้งหมด เพราะ dump มี `DROP TABLE IF EXISTS` ก่อน `CREATE`

## ขั้นที่ 8 — ตั้งค่า + build + ให้ขึ้นเองตอนบูต

```bash
cd ~/final-project/backend
cp .env.pi.example .env && nano .env
#   <TS_URL>               → respi.<tailnet>.ts.net  (ชื่อเดิม — ดูขั้นที่ 9)
#   STRAVA_CLIENT_SECRET   → ค่าเดิมจาก .env บนโน้ตบุ๊ก
#   MQTT_PORT=1883         → ต้องมี
#   SESSION_SECRET         → ผลจาก `openssl rand -hex 32` (ใช้เซ็น cookie login) · ห้ามใส่ ALLOW_DEV_LOGIN บน server
pnpm install                                  # postinstall รัน prisma generate ให้เอง

cd ../frontend && pnpm install && pnpm run build

# systemd — ปรับ user/path จากไฟล์ของ Pi (respi) เป็นของ VM (plant)
cd ~/final-project
sed -e 's/^User=respi/User=plant/' -e 's#/home/respi/#/home/plant/#' \
  scripts/plant-backend.service | sudo tee /etc/systemd/system/plant-backend.service
sudo systemctl daemon-reload && sudo systemctl enable --now plant-backend

journalctl -u plant-backend -n 20 --no-pager  # ต้องเห็น "Backend ready" + "MQTT broker ready"
curl -s localhost:3000/health                  # {"ok":true,...}
```

## ขั้นที่ 9 — Tailscale + Funnel (ใช้ชื่อเดิม `respi`)

1. **ลบเครื่องเก่าก่อน**: https://login.tailscale.com/admin/machines → เครื่อง `respi` (Pi) → `...` → **Remove** — ไม่งั้น VM จะได้ชื่อ `respi-1` แล้ว URL เปลี่ยน
2. บน VM:
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --hostname=respi            # เปิดลิงก์ที่ขึ้นมาเพื่อ login บัญชีเดิม
sudo tailscale funnel --bg 3000
sudo tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883
tailscale funnel status                        # ต้องเห็นทั้ง :443 และ :8443 พร้อม (Funnel on)
```

### ทางเลือก 9B — ใช้ชื่อใหม่ (เก็บ `respi` ไว้เป็นเครื่องสำรอง)

ไม่ต้องลบเครื่อง `respi` — ตั้งชื่อ VM ใหม่ เช่น `plantvm` แลกกับการที่ URL เปลี่ยน ต้องแก้เพิ่ม 3 จุด:
```bash
sudo tailscale up --hostname=plantvm
sudo tailscale funnel --bg 3000
sudo tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883
```
1. **`.env` บน VM** → `FRONTEND_URL` และ `STRAVA_REDIRECT_URI` เป็น `https://plantvm.<tailnet>.ts.net...` แล้ว `sudo systemctl restart plant-backend`
2. **Strava** → https://www.strava.com/settings/api → Authorization Callback Domain = `plantvm.<tailnet>.ts.net` (**ใส่ได้โดเมนเดียว** — สลับกลับ Pi ต้องแก้คืน)
3. **ESP32** → `http://plantpot-<deviceid>.local` (เช่น `plantpot-pot-001.local` · firmware รุ่นเก่าใช้ `plantpot.local`) → ช่อง Server URL = `https://plantvm.<tailnet>.ts.net` → บันทึก (ไม่ต้อง flash / ไม่ต้องเปลี่ยน token)

> **ใช้งานจริงได้ทีละเครื่อง** — ฐานข้อมูลของ VM กับ Pi แยกกัน ทุกครั้งที่สลับ: dump จากเครื่องที่ใช้อยู่ → import เข้าอีกเครื่อง → ค่อยเปลี่ยน 3 จุดข้างบน
> เครื่อง `respi` ใน Tailscale ใช้สำรองได้เฉพาะถ้า SD card ของ Pi ไม่เสีย (ตัวตนของเครื่องเก็บอยู่บน SD) — ถ้าต้อง flash SD ใหม่ ให้ลบ `respi` เก่าแล้วตั้งชื่อเดิมให้ Pi ตัวใหม่

## ขั้นที่ 10 — ให้โน้ตบุ๊กทำงานต่อเนื่อง

**ห้าม sleep** — PowerShell (Run as Administrator):
```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```
Control Panel → Power Options → **Choose what closing the lid does** → When plugged in: **Do nothing**

**กัน Windows Update รีสตาร์ทเอง**: Settings → Windows Update → **Pause updates** (สูงสุด 5 สัปดาห์)

**เปิด VM แบบไม่มีหน้าต่าง** (ปิดหน้าต่าง VirtualBox ได้ VM ยังรัน):
```powershell
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" startvm plant-server --type headless
```

**ให้ VM เปิดเองหลัง Windows รีสตาร์ท**: Task Scheduler → Create Basic Task → Trigger **When I log on** → Action **Start a program**:
- Program: `C:\Program Files\Oracle\VirtualBox\VBoxManage.exe`
- Arguments: `startvm plant-server --type headless`

**ก่อนปิดหรือรีสตาร์ทโน้ตบุ๊กทุกครั้ง** ให้สั่ง VM ปิดอย่างถูกต้องก่อน (กันไฟล์ MySQL เสียหาย):
```powershell
& "C:\Program Files\Oracle\VirtualBox\VBoxManage.exe" controlvm plant-server acpipowerbutton
```
ใน VM ทุกอย่างขึ้นเองตอนบูต: MySQL (`restart: always`) · backend (systemd) · Tailscale + Funnel (จำค่าไว้เอง)

## ขั้นที่ 11 — ตรวจผล

1. **มือถือ 4G ปิดแอป Tailscale** → เปิด `https://respi.<tailnet>.ts.net/health` → `{"ok":true,...}`
   (อย่าทดสอบจากโน้ตบุ๊กที่อยู่ใน tailnet — ได้ผลเพี้ยน)
2. `journalctl -u plant-backend -f` → ต้องเห็น `[mqtt] POT-001 connected` ขึ้นเอง (ESP32 ลองต่อใหม่ทุก 5 วิ)
3. Login Strava บนเว็บ → แต้มตรงกับก่อนย้าย
4. กดรดน้ำ 1 ครั้ง → ปั๊มทำงาน (วาล์ว → ปั๊ม → ดูดสาย) · RecentActions เป็น "สำเร็จ"

## แก้ปัญหา

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `ssh: connect to host 127.0.0.1 port 2222: Connection refused` | VM ยังไม่บูตเสร็จ หรือไม่ได้ตั้ง Port Forwarding (ขั้นที่ 2) หรือไม่ได้ติ๊ก OpenSSH server ตอนติดตั้ง (`sudo apt install openssh-server`) |
| `permission denied ... docker.sock` | ยังไม่ได้ ssh เข้าใหม่หลัง `usermod -aG docker` |
| `@prisma/client did not initialize yet` | pnpm ไม่ได้ generate — ตรวจ `pnpm -v` เป็น 10.x แล้ว `cd backend && pnpm exec prisma generate` |
| `Access denied` ตอน import dump | MySQL ยังเริ่มไม่เสร็จ รอ 30 วิแล้วลองใหม่ (`docker logs plant_mysql_db`) |
| URL กลายเป็น `respi-1.<tailnet>.ts.net` | ลืมลบเครื่อง `respi` เก่าก่อน `tailscale up` → ลบเครื่องเก่า แล้ว `sudo tailscale set --hostname=respi` |
| ESP32 ไม่ต่อ (`journalctl` เงียบ) | `tailscale funnel status` ต้องมี `:8443` · เปิด `http://plantpot-<deviceid>.local/log` ดูว่า `connect failed state=` เท่าไร (`-2` = ต่อพอร์ตไม่ได้, `4` = token ผิด) |
| เว็บหลุดตอนปิดฝาโน้ตบุ๊ก | ยังไม่ได้ตั้ง Lid → Do nothing (ขั้นที่ 10) |

## ย้ายกลับไป Raspberry Pi (เมื่อซ่อมเสร็จ)

1. บน VM: dump ข้อมูลล่าสุด
   `docker exec plant_mysql_db mysqldump --no-tablespaces -uplant_dev -pdevpassword123 plant_run_db > ~/backup-$(date +%F).sql`
2. ติดตั้ง Pi ตาม `pi-setup.md` แล้ว import dump นี้
3. ลบเครื่อง `respi` (VM) ออกจาก Tailscale admin → บน Pi `sudo tailscale up --hostname=respi` → เปิด Funnel 443 + 8443
4. ปิด VM — ESP32 และ Strava ย้ายตามมาเองเพราะ URL เดิม
