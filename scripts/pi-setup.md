# ติดตั้งระบบบน Raspberry Pi 3 B+ + Tailscale Funnel

คู่มือนี้ทำครั้งเดียวจบ หลังจากนี้ ESP32 กับหน้าเว็บจะใช้ URL เดียวถาวร ย้ายไปต่อ Wi-Fi ที่ไหนก็ไม่ต้องแก้อะไร

**ผลลัพธ์ที่จะได้**: `https://plantpi.<ชื่อ-tailnet>.ts.net` เปิดจากมือถือ/โน้ตบุ๊กที่ไหนก็ได้ และ ESP32 ยิงเข้ามาที่ URL นี้

> 📌 **คู่มือนี้สมมติว่า hostname = `plantpi` และ user = `pi`** ถ้าตอนเขียน SD ตั้งไว้เป็นอย่างอื่น
> (เช่น hostname `respi` / user `respi`) ให้แทนที่ `pi@plantpi.local` ด้วย `<user>@<hostname>.local`
> หรือ IP ตรง ๆ ทุกจุด และแก้ `User=` กับ `WorkingDirectory=` ใน `plant-backend.service` ขั้นที่ 10 ให้ตรงด้วย
>
> **โครงสร้างโฟลเดอร์**: `code/` เป็น root ของ git repo — พอ clone มาเป็น `final-project`
> เนื้อหาจะอยู่ที่ `~/final-project/backend`, `~/final-project/frontend` **ไม่มีชั้น `code/` คั่น**

---

## ขั้นที่ 0 — ของที่ต้องมี

- Raspberry Pi 3 B+ + อะแดปเตอร์ (**ต้อง 2.5A ขึ้นไป** ถ้าไฟไม่พอ Pi จะรีบูตเองตอน MySQL ทำงานหนัก)
- MicroSD 8GB+ (สำหรับบูต)
- **External SSD 128GB** (สำหรับฐานข้อมูล — มีอยู่แล้ว ✅)
- สาย LAN หรือ Wi-Fi ที่ Pi ต่อได้
- บัญชี Tailscale (สมัครฟรีด้วย Google/GitHub ที่ https://login.tailscale.com)

> ⚠️ **จุดตายที่ห้ามพลาด**: ต้องลง OS **64-bit** เท่านั้น เพราะ Prisma ไม่มีเอนจินสำหรับ ARM 32 บิต และ image `mysql:8.0` ก็ไม่มีเวอร์ชัน 32 บิต ถ้าลงผิดต้องล้างลงใหม่ ไม่มีทางแก้อย่างอื่น

---

## ขั้นที่ 1 — เขียน OS ลง SD card

ทำบนโน้ตบุ๊ก ด้วย **Raspberry Pi Imager** (https://www.raspberrypi.com/software/)

1. **Choose OS** → `Raspberry Pi OS (other)` → **`Raspberry Pi OS Lite (64-bit)`**
   - ต้องมีคำว่า **64-bit** และเป็น **Lite** (ไม่มีหน้าจอเดสก์ท็อป — ประหยัด RAM ที่มีแค่ 1GB)
2. **Choose Storage** → เลือก SD card
3. กด **⚙️ (Settings)** ก่อนเขียน แล้วตั้ง:

| ช่อง | ใส่อะไร |
|---|---|
| Set hostname | `plantpi` |
| Enable SSH | ✅ Use password authentication |
| Set username and password | `pi` / รหัสที่จำได้ (จดไว้) |
| Configure wireless LAN | ชื่อ Wi-Fi + รหัส + Country: `TH` |
| Set locale | Time zone `Asia/Bangkok` |

4. **WRITE** → รอจนเสร็จ → เสียบ SD เข้า Pi → **ยังไม่ต้องเสียบ SSD** → เปิดไฟรอ ~2 นาที

---

## ขั้นที่ 2 — เข้า Pi ครั้งแรก

จากโน้ตบุ๊ก (PowerShell หรือ WSL):

```bash
ssh pi@plantpi.local
```

ถ้า `plantpi.local` ไม่ติด ให้หา IP จากหน้า router แล้ว `ssh pi@<ip>` แทน

**ตรวจว่าเป็น 64-bit จริง — สำคัญที่สุด:**

```bash
uname -m
```

- ได้ **`aarch64`** → ถูกต้อง ไปต่อได้ ✅
- ได้ `armv7l` → เป็น 32-bit ต้องกลับไปขั้นที่ 1 เขียน SD ใหม่ ❌

อัปเดตระบบ:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

---

## ขั้นที่ 3 — เตรียม SSD (ฐานข้อมูลจะอยู่ที่นี่)

เสียบ SSD เข้า Pi แล้ว ssh กลับเข้าไป

```bash
lsblk -o NAME,SIZE,FSTYPE,LABEL,MOUNTPOINT
```

มองหาก้อนขนาดราว 110-120G — ปกติดิสก์ชื่อ `sda` ส่วนพาร์ทิชันอาจเป็น `sda1` หรือเลขอื่น
(ถ้า SSD เคยใช้กับ Windows/Mac มาก่อนจะมี `sda1`-`sda3` เป็น EFI/Recovery แล้วก้อนข้อมูลจริงไปอยู่ `sda4`)

> SSD 128GB ขึ้นเป็น ~111-119G เป็นเรื่องปกติ — ผู้ผลิตนับ 1 GB = 1000³ ไบต์ แต่ Linux นับ 1024³

> ⚠️ **ขั้นตอนถัดไปลบข้อมูลถาวร กู้ไม่ได้** เช็คให้แน่ว่าเป็น SSD จริง ไม่ใช่ `mmcblk0` (SD card ที่ระบบบูตอยู่)

**ทางเลือก ก — ล้างทั้งก้อนแล้วสร้างพาร์ทิชันเดียว** (แนะนำ ถ้า SSD ว่างและมีพาร์ทิชันเก่ารก):

```bash
sudo wipefs -a /dev/sda
sudo parted /dev/sda --script mklabel gpt mkpart primary ext4 0% 100%
SSD_PART=/dev/sda1
```

**ทางเลือก ข — ใช้พาร์ทิชันที่มีอยู่** (แทนเลขให้ตรงกับที่เห็นใน `lsblk`):

```bash
SSD_PART=/dev/sda4        # ← แก้เลขตรงนี้จุดเดียว ที่เหลือใช้ตัวแปรต่อ
```

**ฟอร์แมตเป็น ext4** (ห้ามใช้ exFAT/NTFS — MySQL ต้องการ permission แบบ Linux):

```bash
sudo umount $SSD_PART 2>/dev/null
sudo mkfs.ext4 -L plantssd $SSD_PART
```

**ตั้งให้ mount อัตโนมัติทุกครั้งที่บูต** (ใช้ UUID ไม่ใช่ชื่อ device เพราะ `sda`/`sdb` สลับกันได้):

```bash
sudo mkdir -p /mnt/ssd
UUID=$(sudo blkid -s UUID -o value $SSD_PART)
sudo cp /etc/fstab /etc/fstab.bak
sudo sed -i '\|[[:space:]]/mnt/ssd[[:space:]]|d' /etc/fstab      # ★ ลบบรรทัดเก่าของ /mnt/ssd ก่อนเสมอ
echo "UUID=$UUID /mnt/ssd ext4 defaults,noatime,nofail 0 2" | sudo tee -a /etc/fstab
grep -c '[[:space:]]/mnt/ssd[[:space:]]' /etc/fstab   # ★ ต้องได้ 1 เท่านั้น
sudo systemctl daemon-reload
sudo mount -a
findmnt /mnt/ssd        # ★ ต้องเห็น /dev/sdaX — `df` เชื่อไม่ได้ (ดูกล่องเตือนข้างล่าง)
```

> 🛑 **ห้ามใช้ `tee -a` เฉย ๆ ถ้าเคยตั้งไว้แล้ว** — ทุกครั้งที่ `mkfs` ใหม่ UUID จะเปลี่ยน ถ้า append
> บรรทัดใหม่โดยไม่ลบของเก่า จะเหลือ 2 บรรทัดที่ mountpoint เดียวกัน แล้ว **systemd จะยึดบรรทัดแรก
> (UUID ผีที่ไม่มีอยู่จริง) และมองข้ามบรรทัดที่ถูกต้อง** ผลคือ SSD ไม่ mount ทุกครั้งที่บูต
> โดย `nofail` กลบ error ให้เงียบสนิท — **เคยทำให้ฐานข้อมูลไปเขียนลง SD card นาน 6 สัปดาห์
> โดยไม่มีใครรู้ (2026-07-30 → 09-09)**
>
> ตรวจด้วย `findmnt /mnt/ssd` เท่านั้น อย่าใช้ `df -h /mnt/ssd` เพราะ `df` ตอบ filesystem ที่ path
> นั้นตกอยู่จริง — ถ้าไม่ได้ mount มันจะโชว์ SD card (`/dev/mmcblk0p2`) เหมือนทุกอย่างปกติดี

> ⚠️ `SSD_PART` เป็นตัวแปรของ shell ปัจจุบัน ถ้าเผลอปิด terminal หรือ ssh หลุดกลางคัน
> ต้องตั้งใหม่ก่อนรันคำสั่งที่เหลือ ไม่งั้นจะกลายเป็นค่าว่างแล้วคำสั่งทำงานผิดเป้า

`noatime` = ไม่เขียน timestamp ทุกครั้งที่อ่าน (ลด write) · `nofail` = ถ้าวันหนึ่งลืมเสียบ SSD ระบบยังบูตขึ้น ไม่ค้าง

**สร้างโฟลเดอร์ฐานข้อมูล + ย้าย swap มาไว้บน SSD** (RAM 1GB ต้องมี swap ช่วย แต่ห้ามวางบน SD):

```bash
sudo mkdir -p /mnt/ssd/mysql-data

sudo dphys-swapfile swapoff
sudo sed -i 's|^#\?CONF_SWAPFILE=.*|CONF_SWAPFILE=/mnt/ssd/swapfile|' /etc/dphys-swapfile
sudo sed -i 's|^#\?CONF_SWAPSIZE=.*|CONF_SWAPSIZE=2048|' /etc/dphys-swapfile
sudo sed -i 's|^#\?CONF_MAXSWAP=.*|CONF_MAXSWAP=4096|' /etc/dphys-swapfile
sudo dphys-swapfile setup && sudo dphys-swapfile swapon

free -h                 # แถว Swap ต้องขึ้น ~2.0Gi
```

---

## ขั้นที่ 4 — ลง Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

**ต้อง logout แล้ว login ใหม่** ให้สิทธิ์ docker มีผล:

```bash
exit
```
```bash
ssh pi@plantpi.local
docker run --rm hello-world     # ต้องรันได้โดยไม่ต้องใช้ sudo
```

---

## ขั้นที่ 5 — ลง Node 18 + pnpm

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs git
sudo npm install -g pnpm

node -v      # ต้องได้ v18.x
```

---

## ขั้นที่ 6 — เอาโค้ดขึ้น Pi

```bash
cd ~
git clone https://github.com/Nut-ngong-code/plant_run.git final-project
```

ถ้า repo เป็น private แล้วถาม username/password ให้ใช้ **Personal Access Token** แทนรหัสผ่าน (สร้างที่ GitHub → Settings → Developer settings → Tokens) หรือส่งจากโน้ตบุ๊กแทนด้วยคำสั่งนี้ (รันบน **WSL ของโน้ตบุ๊ก**):

```bash
rsync -av --exclude node_modules --exclude .git --exclude dist \
  "/mnt/e/Akapop/final project/code/" pi@plantpi.local:~/final-project/
```

**ติดตั้ง dependency ของ backend** (ขั้นนี้ช้าที่สุด ~10-15 นาที บน Pi 3 ปล่อยไว้ได้):

```bash
cd ~/final-project/backend
pnpm install
pnpm exec prisma generate
```

> `prisma generate` ต้องรัน**บน Pi** เท่านั้น เพราะมันโหลดเอนจินตามสถาปัตยกรรมเครื่อง ห้าม copy `node_modules` จากโน้ตบุ๊กมา

**ส่งหน้าเว็บที่ build แล้วจากโน้ตบุ๊ก** (build บน Pi ช้าโดยไม่จำเป็น — `dist/` เป็นไฟล์ static ใช้ข้ามเครื่องได้):

รันบน WSL ของโน้ตบุ๊ก:
```bash
cd "/mnt/e/Akapop/final project/code/frontend" && pnpm run build
rsync -av dist/ pi@plantpi.local:~/final-project/frontend/dist/
```

---

## ขั้นที่ 7 — เปิดฐานข้อมูล

```bash
cd ~/final-project/database
docker compose -f docker-compose.yml -f docker-compose.pi.yml config | grep -A3 volumes
```
ตรวจว่าเห็น `/mnt/ssd/mysql-data` (ไม่ใช่ `mysql_data`) แล้วค่อยสั่ง:

```bash
docker compose -f docker-compose.yml -f docker-compose.pi.yml up -d
docker compose -f docker-compose.yml -f docker-compose.pi.yml ps    # รอจน (healthy)
```

ครั้งแรกใช้เวลา ~2-3 นาที (MySQL สร้างฐานข้อมูล + รัน `init.sql`) ดูความคืบหน้าได้ด้วย:

```bash
docker logs -f plant_mysql_db
```

ตรวจว่าตารางถูกสร้างครบ 6 ตาราง:

```bash
docker exec plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db -e "SHOW TABLES;"
```

---

## ขั้นที่ 8 — ลง Tailscale + เปิด Funnel

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

จะขึ้นลิงก์ให้เปิดในเบราว์เซอร์เพื่อล็อกอิน → อนุมัติเครื่อง → กลับมาที่ terminal

**ดู URL ที่ได้:**

```bash
tailscale status | head -2
```

จะเห็นชื่อประมาณ `plantpi.tail1234.ts.net` — **จดไว้ ใช้ตลอดทั้งคู่มือ**

**เปิด Funnel ชี้ไปที่พอร์ต 3000:**

```bash
sudo tailscale funnel --bg 3000
tailscale funnel status
```

> ถ้าขึ้น error ว่า Funnel ไม่ได้เปิดใช้งาน ให้เข้า https://login.tailscale.com/admin/dns เปิด **MagicDNS + HTTPS Certificates** ก่อน แล้วสั่งใหม่ ครั้งแรกที่ใช้ Tailscale จะให้กดยืนยันเปิด Funnel ผ่านลิงก์ที่มันพิมพ์ออกมา

**เปิด Funnel ให้ MQTT (ESP32 รับคำสั่งผ่านช่องนี้) — พอร์ต 8443:**

```bash
sudo tailscale funnel --bg --tls-terminated-tcp=8443 tcp://localhost:1883
tailscale funnel status      # ต้องเห็นทั้ง :443 → 127.0.0.1:3000 และ :8443 → tcp://localhost:1883
```

> Funnel เปิดได้แค่พอร์ต 443 / 8443 / 10000 — เว็บใช้ 443 ไปแล้ว MQTT จึงใช้ 8443
> `--tls-terminated-tcp` = Funnel ถอด TLS ให้ แล้วส่ง MQTT ธรรมดาเข้าพอร์ต 1883 ของ backend (ESP32 ต่อแบบเข้ารหัสจากภายนอก)

Funnel จำค่าไว้เองข้ามการรีบูต ไม่ต้องตั้ง systemd เพิ่ม

> ⚠️ **รูปแบบ URL ที่ใช้เปิดเว็บ** — ต้องเป็น `https://plantpi.tail1234.ts.net` เท่านั้น
> - **ต้องมี `https://`** — Funnel เปิดเฉพาะพอร์ต 443 ส่วนพอร์ต 80 ไม่ได้เปิด ถ้าพิมพ์โดเมนเปล่า ๆ
>   เบราว์เซอร์จะลอง `http://` ก่อนแล้วขึ้นว่าเข้าไม่ได้ (`Connection refused`)
> - **ห้ามใส่ `:3000`** — Funnel รับที่ 443 แล้วส่งต่อเข้า 3000 ให้เองที่ฝั่ง Pi
>   ถ้าใส่จะได้ error `SSL wrong version number` เพราะพอร์ต 3000 พูด HTTP ธรรมดา
>
> ถ้าอยากพิมพ์โดเมนเปล่า ๆ แล้วเข้าได้ (เฉพาะตอนอยู่ในวง Tailscale) เพิ่ม:
> ```bash
> sudo tailscale serve --bg --http=80 3000
> ```

---

## ขั้นที่ 9 — ตั้งค่า .env

```bash
cd ~/final-project/backend
cp .env.pi.example .env
nano .env
```

แก้ 3 จุด (แทน `<TS_URL>` ด้วยชื่อจากขั้นที่ 8 เช่น `plantpi.tail1234.ts.net`):

```
FRONTEND_URL=https://plantpi.tail1234.ts.net
STRAVA_REDIRECT_URI=https://plantpi.tail1234.ts.net/api/auth/strava/callback
STRAVA_CLIENT_SECRET=<คัดลอกจาก .env บนโน้ตบุ๊ก>
```

บันทึกด้วย `Ctrl+O` → `Enter` → ออกด้วย `Ctrl+X`

**ทดลองรันดูก่อน:**

```bash
node src/index.js
```

ต้องขึ้น 2 บรรทัด:
```
🌱 Backend ready at http://localhost:3000
   เสิร์ฟหน้าเว็บจาก /home/pi/final-project/frontend/dist (API index อยู่ที่ /_api)
```

ถ้าบรรทัดที่สองบอกว่า *ไม่พบ frontend/dist* แปลว่าขั้นที่ 6 ยังไม่ได้ส่ง `dist/` มา

เปิดเบราว์เซอร์บนมือถือ (ปิด Wi-Fi ใช้ 4G ก็ได้ — พิสูจน์ว่าเข้าได้จากทุกที่จริง) ไปที่ `https://plantpi.tail1234.ts.net` ต้องเห็นหน้าเว็บโครงงาน

กด `Ctrl+C` เพื่อหยุด แล้วไปขั้นต่อไป

---

## ขั้นที่ 10 — ให้ backend ขึ้นเองตอนบูต

```bash
sudo cp ~/final-project/scripts/plant-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now plant-backend
systemctl status plant-backend        # ต้องเป็น active (running)
```

ดู log สด:
```bash
journalctl -u plant-backend -f
```

**ทดสอบของจริง — ถอดปลั๊ก Pi แล้วเสียบใหม่** รอ ~2 นาที แล้วเปิด URL ต้องขึ้นเองโดยไม่ต้อง ssh เข้าไปทำอะไร

---

## ขั้นที่ 11 — อัปเดต Strava

เข้า https://www.strava.com/settings/api แล้วแก้ช่อง **Authorization Callback Domain**:

```
plantpi.tail1234.ts.net
```

ใส่**โดเมนเปล่า ๆ เท่านั้น** — ห้ามมี `https://` ห้ามมี `/` ต่อท้าย ห้ามมี path

---

## ขั้นที่ 12 — ตั้ง ESP32

1. Arduino IDE → Library Manager → ติดตั้ง **PubSubClient** (by Nick O'Leary) → Verify + upload `esp32_v-1.ino` ตัวล่าสุด (รุ่น MQTT)
2. กดปุ่ม BOOT ค้าง 3 วิ → เข้าโหมดตั้งค่า → ต่อ Wi-Fi ชื่อ `PlantPot-Setup` ด้วยมือถือ
3. กรอกในฟอร์ม:
   - Wi-Fi + รหัส
   - Device ID: `POT-001`
   - Token: กด 🔑 rotate บนหน้าเว็บเพื่อขอใหม่ แล้ววาง
   - **Server URL: `https://plantpi.tail1234.ts.net`** ← ไม่ต้องใส่ `:3000` เพราะ Funnel รับที่ 443 แล้วส่งต่อเอง
4. บันทึก → ESP32 รีบูต → ดู Serial Monitor ต้องเห็น `[mqtt] connected` ตามด้วย `[sensor] publish ok`
   (ถ้าเห็น `connect failed state=4` = token ผิด · `state=-2` = ต่อพอร์ต 8443 ไม่ได้ → เช็ค `tailscale funnel status`)

> **มี MQTT แล้วยังรับ firmware รุ่นเดิมได้** — ถ้า MQTT มีปัญหา flash `firmware/esp32_polling/` กลับได้ทันที backend ยังรองรับ HTTP polling ครบ

หลังจากนี้ย้ายไปต่อ Wi-Fi ที่ไหนก็แค่กด BOOT ค้าง 3 วิ กรอก Wi-Fi ใหม่ **ส่วน Server URL ไม่ต้องแตะอีกเลย**

---

## เช็กลิสต์ตอนเสร็จ

```bash
uname -m                                    # aarch64
df -h /mnt/ssd                              # ~117G
free -h                                     # Swap ~2.0Gi
docker ps                                   # plant_mysql_db (healthy)
systemctl is-active plant-backend           # active
tailscale funnel status                     # :443 → 127.0.0.1:3000 และ :8443 → tcp://localhost:1883
curl -s https://plantpi.tail1234.ts.net/health   # {"ok":true,...}
```

ตัวชี้วัดสุดท้าย — ในฐานข้อมูลต้องมีค่าเข้ามาจริง:

```bash
docker exec plant_mysql_db mysql -uplant_dev -pdevpassword123 plant_run_db \
  -e "SELECT device_id, last_seen_at, TIMESTAMPDIFF(SECOND, last_seen_at, NOW()) AS secs_ago FROM DEVICE;"
```

`secs_ago` ต้องเป็นเลขน้อย ๆ (ต่ำกว่า 60) = ESP32 คุยกับ Pi ได้แล้ว หน้าเว็บจะขึ้น ONLINE

---

## แก้ปัญหาที่เจอบ่อย

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| `pnpm install` ค้างหรือ Pi ค้างไปเลย | RAM หมด — ตรวจว่าทำขั้นที่ 3 (swap บน SSD) แล้วจริง |
| MySQL เด้งขึ้น ๆ ดับ ๆ | ไฟไม่พอ ใช้อะแดปเตอร์ 2.5A+ หรือ RAM หมด ตรวจ `docker logs plant_mysql_db` |
| เปิด URL แล้ว 502 | backend ไม่ได้รัน — `systemctl status plant-backend` |
| หน้าเว็บขึ้นแต่กดอะไรไม่ได้ | `dist/` เก่า — build ใหม่บนโน้ตบุ๊กแล้ว rsync มาอีกรอบ |
| Strava ล็อกอินแล้วเด้งไป localhost | `FRONTEND_URL` ใน `.env` ยังเป็นค่าเดิม แก้แล้ว `sudo systemctl restart plant-backend` |
| ESP32 ขึ้น `POST -1` | Server URL ผิด หรือลืม `https://` ข้างหน้า |
| ESP32 ขึ้น `POST 401` | Token ไม่ตรง — กด 🔑 rotate บนเว็บแล้วใส่ใหม่ |
| Pi หาไม่เจอหลังย้ายที่ | ssh ผ่าน Tailscale แทนได้เลย: `ssh respi@respi` (ไม่ต้องรู้ IP) |
| `systemctl status` ขึ้น `status=217/USER` | `User=` ใน unit ไม่ตรงกับ user จริงบนเครื่อง (systemd ตายก่อนได้รัน Node เลย) — แก้ `/etc/systemd/system/plant-backend.service` ให้ตรงกับ `whoami` แล้ว `sudo systemctl daemon-reload && sudo systemctl restart plant-backend` |
| log ขึ้น `@prisma/client did not initialize yet` | client ที่ generate จาก schema หายไป มักเกิดหลังรัน `pnpm install` — `cd ~/final-project/backend && pnpm exec prisma generate` |
| `prisma generate` ขึ้น `EPERM ... .cache/prisma` | ไฟล์ cache/node_modules เป็นของ root (เคยรันด้วย sudo) — `sudo chown -R $USER:$USER ~/final-project ~/.cache/prisma` แล้ว generate ใหม่ |
| pnpm เตือน `The "pnpm" field in package.json is no longer read` | pnpm 11 ย้าย setting ไป `pnpm-workspace.yaml` (มีในรีโปแล้ว) ถ้าไม่มีให้ `git pull` — ถ้าปล่อยไว้ pnpm จะบล็อก build script ของ Prisma เงียบ ๆ |
| เบราว์เซอร์เปิดโดเมนไม่ขึ้น แต่ `<tailnet-ip>:3000` เข้าได้ | พิมพ์ URL ไม่ครบ — ต้องมี `https://` นำหน้า และ **ห้ามใส่ `:3000`** (ดูหัวข้อขั้นที่ 8) |
| `findmnt /mnt/ssd` ไม่มี output (แต่ `df` ดูเหมือนปกติ) | SSD ไม่ได้ mount — เช็ค `grep -c '/mnt/ssd' /etc/fstab` ถ้าได้มากกว่า 1 คือมีบรรทัดซ้ำ systemd ยึดบรรทัดแรก ให้ลบบรรทัด UUID เก่าทิ้ง แล้ว `daemon-reload` + `mount -a` · **อย่าแก้ fstab อย่างเดียวถ้าฐานข้อมูลไปอยู่บน SD แล้ว** ต้องย้ายข้อมูลพร้อมกัน ไม่งั้น reboot ครั้งหน้าจะไปเปิดฐานเก่าบน SSD |
| `mysqldump` ขึ้น `you need (at least one of) the PROCESS privilege(s)` | เติม `--no-tablespaces` (user `plant_dev` ไม่มีสิทธิ์ระดับ global) หรือ dump ด้วย `-uroot -prootpassword` |

## คำสั่งที่ใช้บ่อยหลังติดตั้งเสร็จ

**ตรวจสุขภาพระบบทั้งหมดในคำสั่งเดียว** (อ่านอย่างเดียว ปลอดภัย รันได้ทุกเมื่อ):

```bash
bash ~/final-project/scripts/pi-healthcheck.sh
```
ตรวจให้ครบ 7 หมวด: SSD mount + fstab ซ้ำ · MySQL · systemd unit (รวมเช็ค `User=` ให้ตรงเครื่อง) ·
Prisma Client · เว็บทั้งภายในและผ่าน Funnel · จำนวนข้อมูลในฐาน + heartbeat ของ ESP32 · RAM/ดิสก์/swap
พร้อมบอกคำสั่งแก้ของแต่ละข้อที่ล้มเหลว · ตั้ง alias ให้เรียกสั้น ๆ ได้:
```bash
echo "alias plantcheck='bash ~/final-project/scripts/pi-healthcheck.sh'" >> ~/.bashrc && source ~/.bashrc
```

```bash
# อัปเดตโค้ดใหม่  (repo ไม่มีชั้น code/ — เนื้อหาอยู่ที่ ~/final-project/backend เลย)
cd ~/final-project && git pull
cd ~/final-project/backend && pnpm install     # postinstall จะ prisma generate ให้เอง
sudo systemctl restart plant-backend
curl -sS localhost:3000/health                 # ต้องได้ {"ok":true,...} ก่อนถือว่าจบ

# ดู log
journalctl -u plant-backend -f

# สำรองฐานข้อมูล (ทำก่อนวันนำเสนอ!)
docker exec plant_mysql_db mysqldump -uplant_dev -pdevpassword123 \
  --single-transaction --routines --events --no-tablespaces plant_run_db \
  > ~/backup-$(date +%F).sql
tail -1 ~/backup-$(date +%F).sql     # ต้องลงท้ายด้วย "-- Dump completed on ..."
# --no-tablespaces จำเป็น เพราะ user plant_dev ไม่มีสิทธิ์ PROCESS ระดับ global
```
