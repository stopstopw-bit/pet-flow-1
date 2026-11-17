/**
 * การ์ด LINE ฉบับภาษาอังกฤษแบบตายตัว — ข้อความของระบบทุกข้อความมีคำแปลเขียนไว้ล่วงหน้า
 * ส่งแล้วเปลี่ยนเป็นอังกฤษทันที เหมือนกันทุกครั้ง ไม่ต้องรอ AI
 *
 * วิธีทำงาน: ดูข้อความในการ์ดทีละข้อความ (ไทย)
 *   1) ตรงกับข้อความในตาราง → ใช้คำแปลในตาราง
 *   2) ตรงกับแม่แบบที่มีช่องว่าง {0}/{cat}/… → แปลส่วนที่เหลือ แล้วใส่ค่าเดิม (ชื่อ ยอดเงิน วันที่) กลับเข้าไป
 *   3) ไม่ตรงทั้งก้อน → แยกทีละบรรทัด / ทีละช่วง " · " แล้วลองใหม่
 *   4) คำทั่วไปที่เจอบ่อย (วันที่ไทย, "บาท", "คืน", "น้อง…", "คุณ…") แปลงตามกฎ
 * ข้อความที่ร้านพิมพ์เอง (ชื่อโปร, ข้อความการ์ดที่แก้ใน /admin/cards) ไม่อยู่ในตาราง
 * → line-i18n.ts ส่งเฉพาะข้อความพวกนั้นไปให้ AI แปล (แปลไม่ได้ = ใช้ไทย)
 *
 * เพิ่ม/แก้ข้อความการ์ดภาษาไทยในโค้ดเมื่อไหร่ ให้เพิ่มคำแปลที่นี่ด้วย
 */

/** [ไทย, อังกฤษ] — {0} {1} … หรือ {ชื่อ} = ค่าที่เปลี่ยนไปตามการ์ด (คงค่าเดิม) */
const ENTRIES: [string, string][] = [
  // ── คำนำหน้า / ทั่วไป ──
  ["คุณ{name}", "{name}"],
  ["น้อง{cat}", "{cat}"],
  ["น้องแมว", "Your cat"],
  ["น้องๆ {0} ตัว", "{0} cats"],
  ["{0} ({1} ตัว)", "{0} ({1} cats)"],
  ["ร้านของเรา", "our shop"],
  ["เรา", "us"],
  ["ห้องพัก", "Room"],
  ["อาบน้ำ", "Bath"],
  ["อาบน้ำ & กรูมมิ่ง", "Bath & grooming"],
  ["ห้อง {0}", "Room {0}"],
  [" · ห้อง {0}", " · Room {0}"],
  ["เวลา {0}", "Time {0}"],
  ["วันที่ {0}", "Date {0}"],
  ["{0} · เวลา {1}", "{0} · {1}"],
  ["{0}: {1} น.", "{0}: {1}"],
  [" {0} น.", " {0}"],
  ["ยังไม่ระบุ", "Not set"],
  ["ไม่ทราบ", "Unknown"],
  ["เงินสด", "Cash"],
  ["โอนเงิน", "Bank transfer"],
  ["หักจากคอร์ส", "Deducted from package"],
  ["ฟรี", "Free"],
  ["ชำระแล้ว", "Paid"],
  ["รวม", "Total"],
  ["ส่วนลด", "Discount"],
  ["ส่วนลด · {0}", "Discount · {0}"],
  ["ยอดสุทธิ", "Net total"],
  ["มัดจำ", "Deposit"],
  ["ยอดคงเหลือ", "Balance due"],
  ["คงเหลือ", "Remaining"],
  ["ลูกค้า", "Customer"],
  ["เลขที่", "No."],
  ["สถานะ", "Status"],
  ["หมายเหตุ", "Note"],
  ["วันที่", "Date"],
  ["สถานที่", "Location"],
  ["{0} บาท", "{0} THB"],
  ["{0} ฿", "{0} ฿"],
  ["−{0} ฿", "−{0} ฿"],
  ["{0} {1} บาท", "{0} {1} THB"],
  ["{0} — {1} บาท", "{0} — {1} THB"],
  ["{0} {1} บาท · {2}", "{0} {1} THB · {2}"],
  ["{0} {1} บาท{2}", "{0} {1} THB{2}"],
  ["คืน", "nights"],
  ["ครั้ง", "times"],
  ["คอร์ส", "Package"],
  ["แพ็กห้อง", "Room pack"],
  ["บิล {0}", "Bill {0}"],
  ["กรุงไทย", "Krungthai Bank"],
  ["ชื่อบัญชี:", "Account name:"],
  ["เลขบัญชี: {0}", "Account no.: {0}"],
  ["ชื่อบัญชี: {name}", "Account name: {name}"],
  ["📋 คัดลอกเลขบัญชี", "📋 Copy account number"],
  ["ดูรายละเอียด", "View details"],

  // ── รับ-ส่ง ──
  ["รับ-ส่งน้อง", "Pick-up / drop-off"],
  ["รับ-ส่ง", "Pick-up / drop-off"],
  ["รับ + ส่ง", "Pick-up + drop-off"],
  ["รับน้อง", "Pick-up"],
  ["ส่งน้องกลับบ้าน", "Drop-off home"],
  ["เที่ยวเดียว", "One way"],
  ["ไป-กลับ", "Round trip"],
  ["{0} เที่ยว", "{0} trips"],
  ["ได้รับแผนที่จุดรับ-ส่งแล้ว", "We have your pick-up/drop-off location."],
  ["ยังไม่ได้ส่งจุดรับ-ส่ง กดปุ่มด้านล่างได้เลยค่ะ", "Please send your pick-up/drop-off location with the button below."],
  ["📍 แก้จุดรับ-ส่ง", "📍 Change location"],
  ["📍 ส่งจุดรับ-ส่ง (Google Maps)", "📍 Send location (Google Maps)"],
  ["🗺️ ดูแผนที่ / เส้นทาง", "🗺️ Map / directions"],

  // ── ยืนยันนัด / กำหนดการ ──
  ["เช็คอินตามเวลาที่ยืนยันในแอป", "Check-in at the time you confirmed in the app"],
  ["รอเลือกเวลาในแอป", "Please choose a time in the app"],
  ["หากมีรายละเอียดอื่นๆ เพิ่มเติม สามารถแจ้งในแชท LINE ได้เลยนะคะ", "If there's anything else we should know, just message us on LINE."],
  ["กำหนดการนัด {0} — {1}", "Appointment {0} — {1}"],
  ["📅 กำหนดการนัด", "📅 Appointment"],
  ["แจ้งกำหนดการนัด 🗓️", "Your appointment 🗓️"],
  ["เวลา / รายละเอียด", "Time / details"],
  ["โปรแกรมอาบน้ำ", "Bath program"],
  ["🍬 อย่าลืมพกขนม/แมวเลียมาด้วยอย่างน้อย 1-2 ซองนะคะ", "🍬 Please bring at least 1-2 sachets of your cat's favourite treats."],
  ["🧺 และให้น้องอยู่ในตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยค่ะ", "🧺 And please bring your cat in a carrier every visit."],
  ["🧺 รบกวนพาน้องใส่ตะกร้า/กระเป๋าทุกครั้งที่มาใช้บริการด้วยนะคะ", "🧺 Please bring your cat in a carrier every visit."],
  ["🕒 เลือกเวลาส่งน้อง", "🕒 Choose drop-off time"],
  ["🕒 เลือกเวลาเข้าพัก", "🕒 Choose check-in time"],
  ["🕒 เลือกเวลารับน้อง", "🕒 Choose pick-up time"],
  ["🕒 เลือกเวลา", "🕒 Choose a time"],
  ["นัดอาบน้ำ", "Bath appointment"],
  ["เข้าพัก", "Stay"],
  ["วันเข้าพัก", "Check-in date"],
  ["อาบน้ำก่อนกลับบ้าน", "Bath before going home"],
  ["🏠 เข้าพัก {0}", "🏠 Stay {0}"],
  ["🏠 เข้าพัก: {0}", "🏠 Stay: {0}"],
  ["เข้าพัก: {0}", "Stay: {0}"],
  ["📅 นัดอาบน้ำ: {0}", "📅 Bath: {0}"],

  // ── ข้อตกลง ──
  ["ข้อตกลงโดยปริยาย", "Deemed consent"],
  ["⚠️ ก่อนอาบน้ำน้อง รบกวนทำ 2 ขั้นตอนนี้ก่อนนะคะ", "⚠️ Before your cat's bath, please complete these 2 steps"],
  ["⚠️ ก่อนฝากน้อง รบกวนทำ 2 ขั้นตอนนี้ก่อนนะคะ", "⚠️ Before your cat's stay, please complete these 2 steps"],
  ["1. กดปุ่มด้านล่าง เพื่ออ่านข้อตกลง{0}", "1. Tap the button below to read our terms{0}"],
  [" {0} ข้อ", " ({0} items)"],
  ["2. กดยอมรับ และเซ็นรับทราบในหน้านั้น", "2. Accept and sign on that page"],
  ["แจ้งการดูแลเพิ่มเติมของน้องในหน้าเดียวกันได้เลยค่ะ 🧡", "You can add any special care notes on the same page 🧡"],
  ["📋 ข้อตกลงก่อนอาบน้ำ", "📋 Bath terms"],
  ["📋 เงื่อนไขก่อนเข้าพัก", "📋 Stay terms"],
  ["อ่านเงื่อนไข + เซ็นยินยอม", "Read terms + sign"],
  ["📋 อ่านกฎ + กดยินยอม", "📋 Read rules + accept"],
  ["หากท่านไม่ได้ตอบกลับ ไม่ได้แนบเอกสาร หรือไม่ได้กดยอมรับข้อตกลงภายในวันเข้าพัก แต่ยังนำน้องแมวเข้าพักตามนัด ทางร้านถือว่าท่านได้รับข้อความนี้แล้ว และรับทราบและยอมรับข้อตกลงและเงื่อนไขการเข้าพักทั้งหมด นับตั้งแต่วันที่ได้รับข้อความนี้ ข้อความนี้มีผลผูกพันและใช้เป็นหลักฐานการตกลงระหว่างท่านกับทางร้านได้ตามกฎหมาย",
    "If you do not reply, attach the documents or accept the terms by the check-in date but still bring your cat for the stay, you are deemed to have received this message and to accept all stay terms and conditions from the date you received it. This message is binding and may be used as legal evidence of the agreement between you and the shop."],
  ["หากท่านไม่ได้ตอบกลับหรือกดยอมรับข้อตกลงภายในวันนัดอาบน้ำ และยังนำน้องแมวมารับบริการตามนัด ทางร้านถือว่าท่านได้รับทราบและยอมรับข้อตกลงและเงื่อนไขการใช้บริการอาบน้ำทั้งหมดแล้ว นับตั้งแต่วันที่ได้รับข้อความนี้ และข้อความนี้ใช้เป็นหลักฐานการตกลงระหว่างท่านกับทางร้านได้ตามกฎหมาย",
    "If you do not reply or accept the terms by the bath appointment date but still bring your cat for the service, you are deemed to accept all bath terms and conditions from the date you received this message, and this message may be used as legal evidence of the agreement between you and the shop."],

  // ── โปร / ชำระเงิน / สรุปการจอง ──
  ["✨ โปรโมชั่น {0}", "✨ Promotion {0}"],
  ["ชำระเงิน {0} บาท", "Payment {0} THB"],
  ["💳 แจ้งชำระเงิน", "💳 Payment due"],
  ["สรุปการจอง", "Booking summary"],
  ["📋 สรุปการจอง", "📋 Booking summary"],
  ["แจ้งมัดจำ", "Deposit request"],
  ["แจ้งยอดชำระ", "Payment due"],
  ["🎁 ของแถมฟรี", "🎁 Free gift"],
  ["มัดจำที่ชำระแล้ว", "Deposit paid"],
  ["มัดจำที่ต้องโอน", "Deposit to transfer"],
  ["💰 มัดจำที่ต้องโอน", "💰 Deposit to transfer"],
  ["ยอดที่ต้องโอนตอนนี้", "Amount to transfer now"],
  ["ยอดคงเหลือ (ก่อนเข้าพัก)", "Balance due (before check-in)"],
  ["ยอดคงเหลือที่ต้องโอน", "Balance to transfer"],
  ["แจ้งยอดคงเหลือที่ต้องโอน", "Balance to transfer"],
  ["มัดจำที่รับ", "Deposit received"],
  ["🐾 เงื่อนไขมัดจำ", "🐾 Deposit terms"],
  ["ขอรับมัดจำ {0} บาท", "Deposit request {0} THB"],
  ["โอนแล้วแจ้งสลิปได้เลยนะคะ 🧡", "Once you've transferred, please send us the slip 🧡"],
  ["🧡 ล็อกคิวให้น้องกันค่ะ", "🧡 Let's reserve your cat's spot"],
  ["เพื่อให้เราจัดคิวและเตรียมห้องให้น้องโดยเฉพาะ", "So we can hold the booking and prepare a room just for your cat,"],
  ["รบกวนชำระ มัดจำ{pct} นะคะ", "please pay a deposit{pct}."],
  [" {0}% ของค่าบริการ", " of {0}% of the total"],
  ["✨ มัดจำส่วนนี้นำไปหักจากยอดสุดท้ายทั้งหมด ไม่มีการเก็บเพิ่มค่ะ", "✨ The deposit is deducted from your final bill — no extra charge."],
  ["โอนแล้วส่งสลิปมาได้เลย เดี๋ยวเรายืนยันคิวให้น้องทันที 🐱", "Send us the slip after transferring and we'll confirm your booking right away 🐱"],
  ["ขอบคุณสำหรับการวางมัดจำ 🧡", "Thank you for your deposit 🧡"],
  ["รับมัดจำของ{cat}เรียบร้อยแล้วนะคะ 🐾 ทางร้านจะเก็บไว้เป็นค่าจองคิว และหักออกจากยอดในวันที่น้องมาใช้บริการค่ะ ขอบคุณที่ไว้ใจให้ {shop} ดูแลน้องนะคะ",
    "We've received the deposit for {cat} 🐾 It holds your booking and will be deducted from the bill on the day of the service. Thank you for trusting {shop} with your cat."],
  ["มัดจำนี้จะนำไปหักเป็นส่วนลดยอดในวันใช้บริการค่ะ", "This deposit will be deducted from your bill on the day of the service."],
  ["ถ้ามีเหตุต้องเลื่อนหรือยกเลิก รบกวนกระซิบบอกเราล่วงหน้าอย่างน้อย 7 วันนะคะ 💛", "If you need to reschedule or cancel, please let us know at least 7 days in advance 💛"],
  ["หากแจ้งกระชั้นกว่า 7 วัน ขออนุญาตเก็บมัดจำไว้เป็นค่าจองคิวที่กันเวลาให้น้องนะคะ ขอบคุณที่เข้าใจค่ะ 🙏", "With less than 7 days' notice, the deposit is kept as a booking fee for the time we reserved. Thank you for understanding 🙏"],
  ["แจ้งยอดคงเหลือก่อนเข้าพัก {0} · {1}", "Balance due before check-in {0} · {1}"],
  ["💳 แจ้งยอดก่อนเข้าพัก", "💳 Balance due before check-in"],
  ["อีก {days} วันถึงวันเข้าพักของ{cat}แล้วนะคะ 🐱", "{cat}'s stay is in {days} days 🐱"],
  ["รบกวนโอนยอดคงเหลือก่อนวันเข้าพัก โอนแล้วแจ้งสลิปในแชทได้เลยค่ะ 🧡", "Please transfer the balance before check-in and send us the slip in the chat 🧡"],
  ["ใกล้ถึงวันเข้าพักของ{cat}แล้วนะคะ ({checkin})", "{cat}'s stay is coming up ({checkin})"],
  ["มัดจำที่ชำระแล้ว: {deposit} บาท", "Deposit paid: {deposit} THB"],
  ["ยอดคงเหลือที่ต้องโอนก่อนเข้าพัก: {remaining} บาท", "Balance to transfer before check-in: {remaining} THB"],

  // ── เตรียมตัวก่อนเข้าพัก ──
  ["🧳 สิ่งที่ต้องเตรียมมาด้วย", "🧳 What to bring"],
  ["📋 ข้อมูลที่ยังต้องส่งให้ร้าน", "📋 Info we still need"],
  ["🏠 เตรียมตัวก่อนเข้าพัก", "🏠 Getting ready for the stay"],
  ["🧡 อ่านรายละเอียด & ยืนยันการเข้าพัก", "🧡 Read details & confirm stay"],
  ["เตรียมตัวก่อนเข้าพัก 🏠 {0}", "Getting ready for the stay 🏠 {0}"],
  ["ใกล้ถึงวันเข้าพักของ{cat}แล้วนะคะ 🐱", "{cat}'s stay is coming up soon 🐱"],
  ["ใกล้ถึงวันเข้าพักของ{cat}แล้วน้า 🐱🧡", "{cat}'s stay is coming up soon 🐱🧡"],
  ["📅 เข้าพัก: {checkin} {checkout}", "📅 Stay: {checkin} {checkout}"],
  ["📋 เตรียมตัวก่อนเข้าพัก:", "📋 Before the stay:"],
  ["• หยดยาป้องกันเห็บหมัด/ปรสิตให้น้องก่อนมา", "• Apply flea/tick/parasite prevention before coming"],
  ["• เตรียมอาหารที่น้องกินประจำ (ระบุมื้อ/ปริมาณ)", "• Bring your cat's usual food (with meals/amounts)"],
  ["• แจ้งประวัติการดูแล นิสัย และโรคประจำตัวของน้อง", "• Tell us about care routine, personality and health conditions"],
  ["มีข้อสงสัยทักแชทได้เลยนะคะ 🧡", "Any questions, just message us 🧡"],
  ["เพื่อให้น้องเข้าพักได้อย่างสบายใจ รบกวนเตรียมสิ่งเหล่านี้มาด้วยนะคะ 🧳", "To help your cat feel at home, please bring these 🧳"],
  ["💊 ยาที่น้องทานเป็นประจำ (ถ้ามี)", "💊 Regular medication (if any)"],
  ["🍽️ อาหารของน้อง พร้อมแจ้งปริมาณต่อมื้อ", "🍽️ Your cat's food, with the amount per meal"],
  ["📖 สมุดวัคซีน หรือรูปใบรับรองวัคซีน", "📖 Vaccination book or a photo of the vaccine certificate"],
  ["🧸 ของเล่นหรือของใช้ส่วนตัวที่มีกลิ่นน้องหรือผู้ปกครอง จะช่วยให้น้องปรับตัวง่ายขึ้นค่ะ", "🧸 A toy or item with your cat's or your scent helps them settle in"],
  ["💌 หากน้องมีนิสัย ความชอบ หรือมีเรื่องที่อยากให้เราดูแลเป็นพิเศษ แจ้งเราได้เลยนะคะ เราอยากให้น้องรู้สึกสบายที่สุดตลอดการเข้าพัก 🧡", "💌 Tell us about your cat's habits, likes or anything that needs special care — we want them to feel as comfortable as possible 🧡"],
  ["⭐ สำหรับการเข้าพักไม่เกิน {min} คืน รบกวนเตรียมทรายของน้องมาด้วยนะคะ เพื่อให้น้องคุ้นเคยและปรับตัวได้ไวขึ้นค่ะ", "⭐ For stays of up to {min} nights, please bring your cat's own litter so they settle in faster."],
  ["🧡 แจ้งเวลาเข้าพักของน้องได้เลยนะคะ เราจะได้เตรียมห้องและรอต้อนรับน้องให้พร้อมค่ะ 🐾", "🧡 Let us know your check-in time so we can have the room ready 🐾"],
  ["📅 วันเข้าพัก: {checkin}", "📅 Check-in: {checkin}"],
  ["🕒 กดปุ่มด้านล่างเพื่อเลือกเวลาที่จะมาส่งน้อง (9:00–19:00 หรือกรอกเวลาเอง)", "🕒 Tap the button below to choose your drop-off time (9:00–19:00, or type your own)"],
  ["พรุ่งนี้ได้เจอ{cat}แล้วนะคะ 🐱🧡", "You'll see {cat} tomorrow 🐱🧡"],
  ["📅 วันรับน้อง: {checkout}", "📅 Pick-up date: {checkout}"],
  ["🕒 กดปุ่มด้านล่างเพื่อเลือกเวลาที่จะมารับน้อง เราจะได้เตรียมน้องให้พร้อมก่อนกลับบ้าน 🧡", "🕒 Tap the button below to choose your pick-up time so we can get your cat ready to go home 🧡"],
  ["(9:00–19:00 หรือกรอกเวลาเอง)", "(9:00–19:00, or type your own)"],

  // ── ขอข้อมูล / เอกสาร ──
  ["🐾 ข้อมูลน้องก่อนเข้าพัก", "🐾 Cat info before the stay"],
  ["🩺 ประวัติน้องก่อนอาบน้ำ", "🩺 Cat history before the bath"],
  ["🩺 แจ้งประวัติน้อง", "🩺 Share your cat's history"],
  ["ใกล้ถึงวันอาบน้ำของ{cat}แล้วนะคะ 🛁🐱", "{cat}'s bath is coming up soon 🛁🐱"],
  ["เพราะเราเป็นห่วงและอยากให้น้องปลอดภัย สบายใจที่สุดตอนอยู่กับเรา 🧡 รบกวนแจ้งประวัติน้องสั้นๆ (กดเลือกเอา ไม่ต้องพิมพ์เยอะ) เพื่อให้เราเตรียมดูแลน้องได้ถูกวิธีนะคะ 🐾",
    "We want your cat to be safe and comfortable with us 🧡 Please share a short history (just tap to choose, no long typing) so we can care for them the right way 🐾"],
  ["💉 ขอรูปสมุดวัคซีนน้อง", "💉 Vaccination book photo"],
  ["รบกวนถ่ายรูปสมุดวัคซีนของ{cat}ส่งให้ทางร้านหน่อยนะคะ 📸", "Please send us a photo of {cat}'s vaccination book 📸"],
  ["แนบได้หลายหน้า กดปุ่มด้านล่างแล้วเลือกรูปได้เลยค่ะ", "You can attach several pages — tap the button below and choose the photos."],
  ["📸 แนบสมุดวัคซีน", "📸 Attach vaccination book"],
  ["🪪 ขอรูปบัตรประชาชนผู้ปกครอง", "🪪 Owner ID photo"],
  ["รบกวนแนบรูปบัตรประชาชนของผู้ปกครองน้อง เพื่อลงทะเบียนเข้าพักนะคะ 🙏", "Please attach a photo of the owner's ID card (or passport) to register the stay 🙏"],
  ["ระบบจะพิมพ์ข้อความขีดทับลงในรูปให้อัตโนมัติก่อนส่ง แนบครั้งเดียวพอ รอบหน้าไม่ต้องแนบอีกค่ะ", "A watermark is added to the photo automatically. You only need to send it once."],
  ["🪪 แนบบัตรประชาชน", "🪪 Attach ID"],
  ["📋 เตรียมตัวก่อนเข้าพัก", "📋 Getting ready for the stay"],
  ["📋 เตรียมตัวก่อนอาบน้ำ", "📋 Getting ready for the bath"],
  ["รบกวนกรอกข้อมูลให้ครบในรอบเดียวนะคะ กดปุ่มด้านล่าง ระบบจะพาไปทีละขั้น เรื่องไหนเคยส่งแล้วจะข้ามให้ค่ะ 🙏", "Please fill in everything in one go — tap the button below and we'll guide you step by step, skipping anything you've already sent 🙏"],
  ["📋 เริ่มกรอกข้อมูล", "📋 Start"],
  ["🐾 แจ้งข้อมูลก่อนเข้าพัก", "🐾 Stay info"],
  ["🩺 แจ้งประวัติก่อนอาบน้ำ", "🩺 Bath history"],
  ["📋 ข้อมูลน้องยังไม่ครบ", "📋 Cat info incomplete"],
  ["ข้อมูลของ{cats}ยังไม่ครบค่ะ ก่อนถึงนัด รบกวนช่วยกรอกให้หน่อยนะคะ (พันธุ์ / อายุ / วันเกิด / โรคประจำตัว) 🙏", "{cats}'s details are incomplete. Before the appointment, please fill them in (breed / age / birthday / health conditions) 🙏"],
  ["✏️ กรอกข้อมูลน้อง", "✏️ Fill in cat info"],
  ["📋 กรุณาอ่านและกดยอมรับข้อตกลงก่อนเข้าพักของ{cat}ที่นี่นะคะ 🧡", "📋 Please read and accept the stay terms for {cat} here 🧡"],
  ["ข้อมูลน้องก่อนเข้าพัก", "Cat info before the stay"],
  ["ประวัติน้องก่อนอาบน้ำ", "Cat history before the bath"],
  ["ขอสมุดวัคซีน", "Vaccination book"],
  ["ขอบัตรประชาชน", "ID card"],
  ["กฎ + กดยินยอม", "Rules + consent"],
  ["แจ้งเตรียมตัวเข้าพัก", "Stay preparation"],

  // ── ใบเสร็จ / คอร์ส / Member / แต้ม ──
  ["🧾 ใบเสร็จรับเงิน", "🧾 Receipt"],
  ["ส่วนลดที่ใช้", "Discounts applied"],
  ["💎 ตัดจากเครดิต Member", "💎 Paid with member credit"],
  ["เครดิตคงเหลือ", "Credit remaining"],
  ["🎫 คอร์สคงเหลือ", "🎫 Package balance"],
  ["เหลือ {0}/{1} {2}", "{0}/{1} {2} left"],
  ["เหลือ {0} {1}", "{0} {1} left"],
  ["🎁 แต้มสะสมที่ได้รับ", "🎁 Points earned"],
  ["ขอบคุณที่ไว้วางใจ{0} นะคะ 🧡", "Thank you for trusting {0} 🧡"],
  ["ใบเสร็จ {0} บาท{1}", "Receipt {0} THB{1}"],
  ["💎 สรุปยอด Member", "💎 Member balance"],
  ["ใช้วันนี้", "Used today"],
  ["ยอด Member {0} บาท", "Member balance {0} THB"],
  ["🧾 รับชำระคอร์สแล้ว", "🧾 Package payment received"],
  ["🧾 รับชำระแพ็กห้องแล้ว", "🧾 Room pack payment received"],
  ["🎫 คอร์สคงเหลือของคุณ", "🎫 Your package balance"],
  ["🏠 คืนคงเหลือของคุณ", "🏠 Your nights remaining"],
  ["รับ{0} {1} เรียบร้อยค่ะ 🧡", "We've received {0} {1} 🧡"],
  ["งวดที่ {0}", "Installment {0}"],
  ["ชำระ", "Paid"],
  ["{0}ที่ใช้ได้อีก", "{0} still available"],
  ["ยอดแพ็ก", "Pack price"],
  ["จ่ายแล้ว", "Paid"],
  ["เหลืออีก", "Remaining"],
  ["{0} งวด (งวดละ ~{1})", "{0} installments (~{1} each)"],
  ["1 งวด", "1 installment"],
  ["เริ่มใช้คอร์สได้เมื่อชำระครบทุกงวดนะคะ", "You can start using the package once all installments are paid."],
  ["เริ่มใช้คืนได้เมื่อชำระครบทุกงวดนะคะ", "You can start using the nights once all installments are paid."],
  ["ชำระครบ ใช้ได้เลย ✅", "Fully paid, ready to use ✅"],
  ["พักห้องไหน ระบบหักคืนของห้องนั้นให้ตามจริงนะคะ 🐾", "Nights are deducted for whichever room your cat stays in 🐾"],
  ["รับชำระ{0} {1} บาท · คงเหลือ {2} บาท", "Received {0} {1} THB · remaining {2} THB"],
  ["{0}คงเหลือ {1} {2}", "{0} remaining {1} {2}"],
  ["🎫 คอร์สของคุณ", "🎫 Your package"],
  ["ใช้ได้อีก", "Remaining"],
  ["{0} / {1} ครั้ง", "{0} / {1} times"],
  ["แจ้งร้านได้เลยตอนมาใช้บริการว่าจะหักจากคอร์สนะคะ 🧡", "Just tell us at your visit that you'd like to use your package 🧡"],
  ["คอร์ส {0} — ใช้ได้อีก {1} ครั้ง", "Package {0} — {1} uses left"],
  ["🎁 ได้รับแต้มสะสมแล้ว", "🎁 Points added"],
  ["แต้มที่ได้รับ", "Points earned"],
  ["เหตุผล", "Reason"],
  ["{0} {1} แต้ม", "{0} {1} points"],
  ["แต้มสะสมรวมตอนนี้", "Total points now"],
  ["ขอบคุณที่ไว้ใจ {0} นะคะ 🧡", "Thank you for trusting {0} 🧡"],
  ["ได้รับ {0} แต้ม{1}", "You earned {0} points{1}"],
  ["มาใช้บริการครั้งแรก", "First visit"],
  ["เพื่อนแนะนำ", "Friend referral"],

  // ── คูปอง / รีวิว / วันเกิด / คิดถึง ──
  ["🎟️ คูปองส่วนลด {0} บาท — {1}", "🎟️ {0} THB coupon — {1}"],
  ["🎟️ คูปองส่วนลดพิเศษ", "🎟️ Special discount coupon"],
  ["กดรับแล้วเก็บไว้ในกระเป๋าคูปอง ใช้เป็นส่วนลดได้เลย", "Tap to save it to your coupon wallet and use it as a discount."],
  [" (ใช้ได้ {0} วัน)", " (valid {0} days)"],
  ["🎟️ กดรับคูปอง", "🎟️ Get coupon"],
  ["🎉 ได้คูปองชวนเพื่อน", "🎉 Referral coupon"],
  ["เพื่อนสมัครด้วยโค้ดของคุณแล้ว! คุณได้รับคูปองส่วนลด {amount}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡", "Your friend signed up with your code! A {amount}฿ coupon is now in your coupon wallet 🧡"],
  ["เพื่อนที่คุณชวนมาใช้บริการแล้ว! คุณได้รับคูปองส่วนลด {amount}฿ เก็บไว้ในกระเป๋าคูปองแล้วนะคะ 🧡", "The friend you invited has visited us! A {amount}฿ coupon is now in your coupon wallet 🧡"],
  ["ใช้ได้ {days} วัน", "Valid {days} days"],
  ["🎟️ ดูคูปองของฉัน", "🎟️ My coupons"],
  ["🧡 ขอบคุณที่เลือก{0} ดูแลน้องนะคะ", "🧡 Thank you for choosing {0} for your cat"],
  ["หวังว่าน้องจะกลับบ้านไปพร้อมความสุข และคุณพ่อคุณแม่จะอุ่นใจทุกครั้งที่ใช้บริการกับเรานะคะ 🐾", "We hope your cat went home happy and that you always feel at ease with us 🐾"],
  ["ถ้าประทับใจในการดูแลของเรา ฝากรีวิวให้ทีมงานสักนิดนะคะ", "If you liked our care, we'd love a short review."],
  ["ทุกรีวิวมีความหมายกับพวกเรามาก และเป็นกำลังใจให้ตั้งใจดูแลน้อง ๆ ทุกตัวต่อไปค่ะ 🤍", "Every review means a lot to us and keeps us motivated to care for every cat 🤍"],
  ["ทุกรีวิวมีความหมายกับพวกเรามาก และเป็นกำลังใจให้ตั้งใจดูแลน้อง ๆ ทุกตัวต่อไปค่ะ", "Every review means a lot to us and keeps us motivated to care for every cat."],
  ["ตลอดช่วงที่น้องเข้าพัก พวกเราตั้งใจดูแลเหมือนเป็นหนึ่งในครอบครัว", "Throughout the stay we cared for your cat like one of the family."],
  ["หวังว่าน้องจะกลับบ้านไปอย่างมีความสุขนะคะ 🐱✨", "We hope your cat went home happy 🐱✨"],
  ["หากประทับใจการเข้าพักของน้อง ฝากรีวิวให้{0} สัก 1 รีวิวนะคะ", "If you enjoyed the stay, please leave {0} a review."],
  ["หวังว่าน้องจะกลับบ้านไปตัวหอม นุ่มฟู และมีความสุขนะคะ 🐱✨", "We hope your cat went home clean, fluffy and happy 🐱✨"],
  ["ถ้าประทับใจบริการของเรา ฝากรีวิวสั้น ๆ ให้ทีมงานหน่อยนะคะ", "If you liked our service, we'd love a short review."],
  ["รีวิวของคุณคือกำลังใจเล็ก ๆ", "Your review is a little encouragement"],
  ["ที่ทำให้พวกเราตั้งใจดูแลน้องแมวทุกตัวให้ดีที่สุดเลยค่ะ 💕", "that helps us give every cat our very best 💕"],
  ["⭐ รีวิวให้เราหน่อยนะคะ", "⭐ Leave us a review"],
  ["⭐ ขอบคุณที่ใช้บริการค่ะ", "⭐ Thank you for visiting us"],
  ["หวังว่า{cat}จะมีความสุขกับการเข้าพักนะคะ 🐱", "We hope {cat} enjoyed the stay 🐱"],
  ["ถ้าประทับใจ รบกวนรีวิวให้กำลังใจเราสักนิดได้ไหมคะ 🥺 มีความหมายกับเรามากๆ เลยค่ะ ขอบคุณที่ไว้ใจให้ {shop} ดูแลน้องนะคะ 💛", "If you were happy with us, could you leave a short review? 🥺 It means a lot. Thank you for trusting {shop} with your cat 💛"],
  ["🎂 สุขสันต์วันเกิด", "🎂 Happy birthday"],
  ["🎂 สุขสันต์วันเกิด{name} นะคะ! 🥳", "🎂 Happy birthday, {name}! 🥳"],
  ["ขอให้ปีนี้มีแต่ความสุข สุขภาพแข็งแรง และมีเวลาดีๆ กับน้องแมวเยอะๆ นะคะ 🐱💛", "Wishing you a happy, healthy year with lots of good times with your cat 🐱💛"],
  ["🎁 ทาง {shop} มีของขวัญวันเกิดให้ด้วยค่ะ", "🎁 {shop} has a birthday gift for you"],
  ["🎂 สุขสันต์วันเกิด{cat} นะคะ! 🥳", "🎂 Happy birthday, {cat}! 🥳"],
  ["ขอให้น้องสุขภาพแข็งแรง น่ารักแบบนี้ตลอดไปเลยน้าา 🐱💛", "Stay healthy and adorable forever 🐱💛"],
  ["🎁 ทาง {shop} มีของขวัญวันเกิดให้ — รับส่วนลดพิเศษเดือนเกิดของน้อง ทักมารับสิทธิ์ได้เลยค่ะ", "🎁 {shop} has a birthday gift — a special discount for your cat's birthday month. Message us to claim it."],
  ["คิดถึงน้องนะคะ", "We miss your cat"],
  ["คิดถึงน้องแล้วค่ะ 💛", "We miss your cat 💛"],
  ["สวัสดีค่ะ {name} 🐱", "Hi {name} 🐱"],
  ["คิดถึงน้อง{cats} จังเลย 💛", "We miss {cats} so much 💛"],
  ["{0} มีสิทธิพิเศษมามอบให้นะคะ 🎁", "{0} has a special offer for you 🎁"],

  // ── พร้อมกลับบ้าน / อัปเดตรายวัน ──
  ["🎉 น้องพร้อมกลับบ้านแล้วค่ะ", "🎉 Your cat is ready to go home"],
  ["เช็คเอาท์เรียบร้อย รอคุณแม่มารับได้เลยค่ะ", "Checked out and waiting for you to pick them up."],
  ["อาบน้ำเสร็จเรียบร้อย สวยหล่อพร้อมกลับบ้านแล้วค่ะ", "All done with the bath — looking great and ready to go home."],
  ["🚗 เวลาที่แจ้งไว้ว่าจะมารับ", "🚗 Your pick-up time"],
  ["{0} พร้อมกลับบ้านแล้วค่ะ", "{0} is ready to go home"],
  ["🐾 อัปเดตน้องวันนี้", "🐾 Today's update"],
  ["ส่งความคิดถึงจาก {0} 🧡", "With love from {0} 🧡"],
  ["อัปเดต{cat}วันนี้ 🐾", "Today's update on {cat} 🐾"],
  // ธนาคาร
  ["กสิกรไทย", "Kasikornbank (KBank)"], ["ธนาคารกสิกรไทย", "Kasikornbank (KBank)"],
  ["กรุงเทพ", "Bangkok Bank"], ["ธนาคารกรุงเทพ", "Bangkok Bank"],
  ["ไทยพาณิชย์", "SCB"], ["ธนาคารไทยพาณิชย์", "SCB"],
  ["กรุงไทย", "Krungthai Bank"], ["ธนาคารกรุงไทย", "Krungthai Bank"],
  ["กรุงศรี", "Krungsri"], ["กรุงศรีอยุธยา", "Krungsri"], ["ธนาคารกรุงศรีอยุธยา", "Krungsri"],
  ["ทหารไทยธนชาต", "ttb"], ["ทีทีบี", "ttb"], ["ออมสิน", "GSB"], ["ธนาคารออมสิน", "GSB"],
  ["พร้อมเพย์", "PromptPay"],
  // หัวการ์ด/ข้อความตั้งต้นที่ร้านมักใช้
  ["สรุปค่าบริการ", "Service summary"], ["สรุปค่าบริการ — {0}", "Service summary — {0}"],
  ["แจ้งมัดจำ", "Deposit request"], ["ได้รับมัดจำแล้ว", "Deposit received"], ["ได้รับมัดจำแล้ว — {0}", "Deposit received — {0}"],
  ["ยอดคงเหลือที่ต้องโอน", "Balance to transfer"],
  ["รบกวนโอนมัดจำเพื่อยืนยันการจองค่ะ", "Please transfer the deposit to confirm your booking."],
  ["ขอบคุณค่ะ", "Thank you"], ["ขอบคุณครับ", "Thank you"], ["ขอบคุณนะคะ", "Thank you"],
  ["มัดจำไม่คืนในทุกกรณี", "The deposit is non-refundable."],
  ["{0}% ของยอดรวม", "{0}% of the total"],
  ["แถม{0}", "Free {0}"],
  ["คอร์ส{0} {1} ครั้ง", "{0} package ({1} times)"], ["คอร์ส{0} {1} คืน", "{0} package ({1} nights)"], ["คอร์ส{0}", "{0} package"], ["({0})", "({0})"],
  ["ส่วนลดสมาชิก", "Member discount"], ["โปรเดือนนี้", "This month's promotion"],
  ["{0} (ใช้ไปบิลนี้ {1})", "{0} (used on this bill: {1})"],
  // บริการ
  ["อาบน้ำ & กรูมมิ่ง", "Bath & grooming"], ["อาบน้ำ", "Bath"], ["ตัดเล็บ", "Nail trim"], ["ตัดขน", "Haircut"], ["อาบน้ำ + ตัดขน", "Bath + haircut"],
  ["เช็ดหู", "Ear cleaning"], ["รับส่ง", "Pick-up & drop-off"], ["ค่ารับส่ง", "Transport fee"],
  ["ค่าห้อง", "Room"], ["แมวเพิ่ม", "Extra cat"], ["ค่าแมวเพิ่ม", "Extra cat fee"],
  ["{0} — น้อง{cat}", "{0} — {cat}"],
  ["อย่าลืมพกขนม/แมวเลียมาด้วยอย่างน้อย 1-2 ซองนะคะ", "Please bring some treats or lickable snacks (at least 1-2 sachets)."],
  ["เข้าพัก {0}", "Stay {0}"], ["อาบน้ำ {0}", "Bath {0}"], ["เหตุผล: {0}", "Reason: {0}"],
  ["ขอรูปสมุดวัคซีนน้อง", "Vaccination book photo"], ["ขอรูปบัตรประชาชนผู้ปกครอง", "Owner's ID card photo"],
  ["เตรียมตัวก่อนเข้าพัก", "Getting ready for the stay"],
  ["คูปองส่วนลด", "Discount coupon"],
  ["กดรับแล้วเก็บไว้ในกระเป๋าคูปอง ใช้เป็นส่วนลดได้เลย (ใช้ได้ {0} วัน) 🧡", "Tap to claim and keep it in your coupon wallet to use as a discount (valid for {0} days) 🧡"],
  ["แจ้งประวัติก่อนอาบน้ำ", "Grooming history"], ["แนบสมุดวัคซีน", "Attach vaccination book"], ["อ่านกฎ + กดยินยอม", "Read the rules + accept"],
  // petflow (หมา/แมว) — ข้อความที่ต่างจาก Catcha
  ["อย่าลืมพกขนมที่น้องชอบมาด้วยนะคะ", "Please bring some of your pet's favourite treats."],
  ["และให้น้องอยู่ในตะกร้า/กระเป๋า หรือใส่สายจูงทุกครั้งที่มาใช้บริการด้วยค่ะ", "And please bring your pet in a carrier or on a leash every visit."],
  ["หากท่านไม่ได้ตอบกลับ ไม่ได้แนบเอกสาร หรือไม่ได้กดยอมรับข้อตกลงภายในวันเข้าพัก แต่ยังนำน้องเข้าพักตามนัด ทางร้านถือว่าท่านได้รับข้อความนี้แล้ว และรับทราบและยอมรับข้อตกลงและเงื่อนไขการเข้าพักทั้งหมด นับตั้งแต่วันที่ได้รับข้อความนี้ ข้อความนี้มีผลผูกพันและใช้เป็นหลักฐานการตกลงระหว่างท่านกับทางร้านได้ตามกฎหมาย",
    "If you do not reply, attach the documents or accept the terms by the check-in date but still bring your pet for the booked stay, we will consider that you have received this message and accept all of our stay terms and conditions from the date you received it. This message is binding and may be used as legal evidence of the agreement between you and the shop."],
];

/** เดือนไทย → อังกฤษ (ย่อ + เต็ม) */
const MONTHS: [string, string][] = [
  ["ม.ค.", "Jan"], ["ก.พ.", "Feb"], ["มี.ค.", "Mar"], ["เม.ย.", "Apr"], ["พ.ค.", "May"], ["มิ.ย.", "Jun"],
  ["ก.ค.", "Jul"], ["ส.ค.", "Aug"], ["ก.ย.", "Sep"], ["ต.ค.", "Oct"], ["พ.ย.", "Nov"], ["ธ.ค.", "Dec"],
  ["มกราคม", "January"], ["กุมภาพันธ์", "February"], ["มีนาคม", "March"], ["เมษายน", "April"],
  ["พฤษภาคม", "May"], ["มิถุนายน", "June"], ["กรกฎาคม", "July"], ["สิงหาคม", "August"],
  ["กันยายน", "September"], ["ตุลาคม", "October"], ["พฤศจิกายน", "November"], ["ธันวาคม", "December"],
];

const WEEKDAYS: [string, string][] = [
  ["วันจันทร์", "Mon"], ["วันอังคาร", "Tue"], ["วันพุธ", "Wed"], ["วันพฤหัสบดี", "Thu"], ["วันศุกร์", "Fri"], ["วันเสาร์", "Sat"], ["วันอาทิตย์", "Sun"],
  ["จ.", "Mon"], ["อ.", "Tue"], ["พ.", "Wed"], ["พฤ.", "Thu"], ["ศ.", "Fri"], ["ส.", "Sat"], ["อา.", "Sun"],
];

const THAI = /[฀-๿]/;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Template = { re: RegExp; keys: string[]; en: string; weight: number };

/** ช่องที่เป็นชื่อ (แมว ลูกค้า ร้าน บัญชี) — คงตามที่พิมพ์ ไม่ต้องแปล */
const NAME_KEYS = new Set(["cat", "name", "shop"]);
/** ค่าที่ดูเป็นชื่อจริง ๆ (ไม่ใช่ประโยค) */
const looksLikeName = (v: string) =>
  v.length > 0 && v.length <= 40 && !v.includes("\n") && !/[.!?:]| · | — | → /.test(v);

const exact = new Map<string, string>();
const templates: Template[] = [];
/**
 * petflow รับทั้งหมาและแมว — ข้อความตั้งต้นใช้ 🐾 และ "น้อง" แทน 🐱 / "น้องแมว"
 * ลงทะเบียนทั้งสองแบบ และคำอังกฤษ cat → pet (ไม่แตะช่อง {cat})
 */
const petEn = (en: string) =>
  en.replace(/🐱/g, "🐾").replace(/(?<!\{)\b([Cc])at(s?)(?!\})\b/g, (_m, c: string, s: string) => `${c === "C" ? "P" : "p"}et${s}`);
const VARIANTS: [string, string][] = [];
for (const [th, en] of ENTRIES) {
  VARIANTS.push([th, petEn(en)]);
  const alt = th.replace(/🐱/g, "🐾").replace(/น้องแมว/g, "น้อง");
  if (alt !== th) VARIANTS.push([alt, petEn(en)]);
}
for (const [th, en] of VARIANTS) {
  const keys: string[] = [];
  const parts = th.split(/\{(\w+)\}/);
  if (parts.length === 1) {
    exact.set(th, en);
    continue;
  }
  let re = "^";
  parts.forEach((p, i) => {
    if (i % 2 === 0) re += esc(p);
    else {
      keys.push(p);
      re += "([\\s\\S]*?)";
    }
  });
  re += "$";
  // แม่แบบที่มีตัวอักษรคงที่ยาวกว่า = เฉพาะเจาะจงกว่า ลองก่อน
  const weight = parts.filter((_, i) => i % 2 === 0).join("").length;
  templates.push({ re: new RegExp(re), keys, en, weight });
}
templates.sort((a, b) => b.weight - a.weight);

/** ชื่อบริการที่เจอปนในรายการบิล (ยาวก่อนสั้น) */
const SERVICE_WORDS: [string, string][] = [
  ["อาบน้ำ + ตัดขน", "Bath + haircut"], ["อาบน้ำ", "Bath"], ["ตัดเล็บ", "Nail trim"], ["ตัดขน", "Haircut"],
  ["เช็ดหู", "Ear cleaning"], ["ค่ารับส่ง", "Transport fee"], ["รับส่ง", "Pick-up & drop-off"],
  ["ค่าแมวเพิ่ม", "Extra cat fee"], ["แมวเพิ่ม", "Extra cat"], ["ค่าห้อง", "Room"],
];

/** คำทั่วไปที่แปลงได้ทุกที่ (หลังจากไม่ตรงตาราง) */
function tokenRules(s: string): string {
  let t = s;
  // วันที่ "15 ธ.ค. 2569/2026" → "15 Dec 2026"
  for (const [th, en] of MONTHS) {
    t = t.replace(new RegExp(`(\\d{1,2})\\s*${esc(th)}\\s*(\\d{4})?`, "g"), (_m, d: string, y?: string) => {
      const year = y ? Number(y) : 0;
      const yy = year > 2400 ? year - 543 : year;
      return `${d} ${en}${yy ? ` ${yy}` : ""}`;
    });
  }
  for (const [th, en] of WEEKDAYS) {
    if (th.length > 3) t = t.split(th).join(en);
  }
  t = t
    .replace(/(\d[\d,.]*)\s*บาท/g, "$1 THB")
    .replace(/(\d+)\s*คืน/g, (_m, n: string) => `${n} night${n === "1" ? "" : "s"}`)
    .replace(/(\d+)\s*วัน(?=[^฀-๿]|$)/g, (_m, n: string) => `${n} day${n === "1" ? "" : "s"}`)
    .replace(/(\d+)\s*ตัว(?=[^฀-๿]|$)/g, (_m, n: string) => `${n} pet${n === "1" ? "" : "s"}`)
    .replace(/(\d+)\s*ครั้ง/g, (_m, n: string) => `${n} time${n === "1" ? "" : "s"}`)
    .replace(/(\d+)\s*แต้ม/g, "$1 points")
    .replace(/(\d{1,2}[:.]\d{2})\s*น\./g, "$1")
    .replace(/(^|[\s(·])ห้อง\s*(?=[A-Za-z0-9])/g, "$1Room ")
    .replace(/(^|[\s(·🐱])น้อง(?=[A-Za-z0-9])/g, "$1")
    .replace(/(^|[\s(·])คุณ(?=[A-Za-z0-9])/g, "$1")
    .replace(/ทุกห้อง/g, "All rooms")
    .replace(/พักต่อ/g, "extended stay")
    .replace(/ต่อคืน/g, "per night")
    .replace(/แถม\s*/g, "Free ");
  for (const [th, en] of SERVICE_WORDS) t = t.replace(new RegExp(`(?<![฀-๿])${esc(th)}`, "g"), en);
  return t;
}

/** แปลข้อความเดียว — คืนข้อความอังกฤษ และ done=false ถ้ายังมีภาษาไทยเหลือ */
export function cardTextToEnglish(s: string, depth = 0): { text: string; done: boolean } {
  if (!THAI.test(s)) return { text: s, done: true };
  const hit = exact.get(s) ?? exact.get(s.trim());
  if (hit !== undefined) {
    const lead = s.match(/^\s*/)?.[0] || "";
    const tail = s.match(/\s*$/)?.[0] || "";
    return { text: exact.has(s) ? hit : lead + hit + tail, done: true };
  }
  if (depth < 4) {
    /** แม่แบบที่ตรงแต่ยังเหลือไทย — เก็บไว้ใช้ถ้าวิธีอื่น (แยกบรรทัด/ช่วง) ไม่ได้ผลดีกว่า */
    let partial: { text: string; done: boolean } | undefined;
    const settle = (r: { text: string; done: boolean }) => (r.done || !partial ? r : partial);
    for (const t of templates) {
      const m = s.match(t.re);
      if (!m) continue;
      let done = true;
      const vals: Record<string, string> = {};
      const names: string[] = [];
      if (t.keys.some((k, i) => NAME_KEYS.has(k) && !looksLikeName(m[i + 1]))) continue;
      t.keys.forEach((k, i) => {
        const r = NAME_KEYS.has(k)
          ? { text: m[i + 1].replace(/(^|,\s*|และ\s*)(?:น้อง|คุณ)(?=\S)/g, "$1"), done: true }
          : cardTextToEnglish(m[i + 1], depth + 1);
        vals[k] = r.text;
        if (NAME_KEYS.has(k)) names.push(r.text);
        if (!r.done) done = false;
      });
      let text = t.en.replace(/\{(\w+)\}/g, (x, k: string) => (k in vals ? vals[k] : x));
      if (!done) {
        // เหลือไทยในช่อง — ลองคำทั่วไปกับทั้งประโยคอีกรอบ (ไม่นับชื่อที่คงไว้)
        text = tokenRules(text);
        let rest = text;
        for (const n of names) rest = rest.split(n).join("");
        done = !THAI.test(rest);
      }
      if (done) return { text, done };
      partial ??= { text, done };
    }
    // อีโมจิ/สัญลักษณ์นำหน้า เช่น "🐱 น้องมะลิ" "• แถมตัดเล็บ"
    const lead = s.match(/^((?:\d+\.\s*)?[^\p{L}\p{N}\s]*\s*)([\s\S]+)$/u);
    if (lead && lead[1] && THAI.test(lead[2])) {
      const r = cardTextToEnglish(lead[2], depth + 1);
      return settle({ text: lead[1] + r.text, done: r.done });
    }
    // แยกบรรทัด
    if (s.includes("\n")) {
      const lines = s.split("\n").map((l) => cardTextToEnglish(l, depth + 1));
      return settle({ text: lines.map((l) => l.text).join("\n"), done: lines.every((l) => l.done) });
    }
    // แยกช่วง " · "
    if (s.includes(" · ")) {
      const parts = s.split(" · ").map((p) => cardTextToEnglish(p, depth + 1));
      return settle({ text: parts.map((p) => p.text).join(" · "), done: parts.every((p) => p.done) });
    }
    // แยก " → "
    if (s.includes(" → ")) {
      const parts = s.split(" → ").map((p) => cardTextToEnglish(p, depth + 1));
      return settle({ text: parts.map((p) => p.text).join(" → "), done: parts.every((p) => p.done) });
    }
    if (partial) return partial;
  }
  const t = tokenRules(s);
  return { text: t, done: !THAI.test(t) };
}
