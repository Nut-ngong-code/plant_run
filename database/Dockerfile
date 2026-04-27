# ใช้ Image MySQL เวอร์ชัน 8.0 (เสถียรและนิยมที่สุด)
FROM mysql:8.0

# กำหนด Timezone ให้เป็นเวลาไทย (ตัวเลือกเสริม แต่มีประโยชน์ตอนเก็บเวลา created_at)
ENV TZ=Asia/Bangkok
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# ก๊อปปี้ไฟล์ SQL ไปใส่ในโฟลเดอร์พิเศษของ MySQL 
# ซึ่ง MySQL จะนำไฟล์ในโฟลเดอร์นี้ไปรันอัตโนมัติ เมื่อเปิด Container ครั้งแรกสุด
COPY ./init.sql /docker-entrypoint-initdb.d/