# Direct LLM smoke test — bypasses the game, hits Ollama API directly
# Mirrors the same system prompt that llm.js builds, runs 3 scenarios,
# measures response time + JSON validity.

$ErrorActionPreference = 'Stop'
$OllamaUrl = "http://127.0.0.1:11434/api/chat"
$Model = "scb10x/llama3.2-typhoon2-3b-instruct"

function Invoke-LlmTurn {
  param(
    [string]$ShopName,
    [string]$Category,
    [string]$Complaint,
    [string]$Policy,
    [string]$ContextLlm,
    [string]$CustomerTypeName,
    [string]$ToneDesc,
    [string]$CustomerName,
    [int]$Mood,
    [int]$Profit,
    [int]$Turns,
    [string]$PlayerMessage
  )

  $sys = @"
คุณคือลูกค้าของร้าน $ShopName ($Category)
สถานการณ์/ปัญหา: $Complaint
นโยบายร้าน (ที่แอดมินรู้): $Policy
บริบทเพิ่ม: $ContextLlm

บุคลิกของคุณ (สาย$CustomerTypeName): $ToneDesc
ชื่อเล่นของคุณ: $CustomerName
มู้ดปัจจุบันของคุณ: $Mood/100  (ยิ่งต่ำยิ่งโกรธ)
กำไรร้านที่เหลือ: $Profit/100
จำนวนรอบสนทนาที่ผ่าน: $Turns

แอดมินเพิ่งตอบกลับว่า: "$PlayerMessage"

งานของคุณ: ตอบกลับเป็นลูกค้าที่มีบุคลิกข้างต้น แล้วประเมินผลของคำตอบของแอดมิน
กฎ:
- ตอบ JSON เท่านั้น ห้ามมีข้อความอื่นนอก JSON
- "customer_reply" เป็นข้อความตอบกลับ 1-3 ประโยคในบุคลิกของคุณ
- "mood_change" คือการเปลี่ยนแปลงมู้ดของคุณ (จำนวนเต็ม -30 ถึง +35)
- "profit_change" คือผลต่อกำไรร้าน (จำนวนเต็ม -40 ถึง 0)
- "creativity_bonus" คะแนนพิเศษถ้าแอดมินตอบฉลาด/มีคุณภาพ (0-20)
- ถ้าแอดมินยอมจ่ายเงินคืน/ทำตามทุกอย่าง: mood +30~+35, profit -30~-40
- ถ้าแอดมินเจรจาเสนอส่วนลด/ของแถม: mood +10~+20, profit -5~-15
- ถ้าแอดมินปฏิเสธสุภาพ: mood -10~-20 (ถ้าเป็นสายพลิก/สายขู่ลงหนักกว่า)
- ถ้าแอดมินปั่น/โยกเรื่อง: mood 0~-10

รูปแบบที่ต้องตอบ (JSON เท่านั้น):
{"mood_change": <int>, "profit_change": <int>, "creativity_bonus": <int>, "customer_reply": "<text>"}
"@

  $body = @{
    model = $Model
    format = "json"
    stream = $false
    options = @{ temperature = 0.85; num_predict = 220; top_p = 0.9 }
    messages = @(
      @{ role = "system"; content = $sys }
      @{ role = "user"; content = $PlayerMessage }
    )
  } | ConvertTo-Json -Depth 6

  $sw = [Diagnostics.Stopwatch]::StartNew()
  try {
    $res = Invoke-RestMethod -Uri $OllamaUrl -Method POST -Body $body -ContentType "application/json" -TimeoutSec 30
    $sw.Stop()
    $raw = $res.message.content
    $parsed = $null
    $parseOk = $false
    try { $parsed = $raw | ConvertFrom-Json; $parseOk = $true } catch { }
    return [PSCustomObject]@{
      Ok = $true
      ElapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      Raw = $raw
      Parsed = $parsed
      ParseOk = $parseOk
    }
  } catch {
    $sw.Stop()
    return [PSCustomObject]@{
      Ok = $false
      ElapsedSec = [math]::Round($sw.Elapsed.TotalSeconds, 2)
      Error = $_.Exception.Message
    }
  }
}

# === Scenario 1: drama × cream, player offers refund ===
Write-Host "`n=== SCENARIO 1: drama × cream, player YIELDS ==="
$r1 = Invoke-LlmTurn `
  -ShopName "Glow Up Cream" -Category "ครีม" `
  -Complaint "ใช้ครีม 3 วันแล้วยังไม่ขาว ขอเงินคืน" `
  -Policy "ครีมต้องใช้ต่อเนื่อง 4-6 สัปดาห์ ไม่รับคืนสินค้าที่เปิดใช้แล้ว" `
  -ContextLlm "ร้านขายครีมหน้าขาว ระบุบนหน้าเพจว่าต้องใช้ 4-6 สัปดาห์" `
  -CustomerTypeName "ดราม่า" -ToneDesc "ใช้อิโมจิ 😭💔 เยอะ พิมพ์ลากเสียง อ้างความเป็นแฟนคลับ" `
  -CustomerName "น้องนุ่น" -Mood 25 -Profit 100 -Turns 0 `
  -PlayerMessage "ขอโทษด้วยค่ะ เดี๋ยวคืนเงินเต็มจำนวนให้เลยนะคะ"
Write-Host "Elapsed: $($r1.ElapsedSec)s  ParseOk: $($r1.ParseOk)"
Write-Host "Raw:`n$($r1.Raw)"
if ($r1.ParseOk) { Write-Host "Parsed: $($r1.Parsed | ConvertTo-Json -Compress)" }

# === Scenario 2: flip × clothes, player REFUSES (should trigger flip penalty) ===
Write-Host "`n=== SCENARIO 2: flip × clothes, player REFUSES ==="
$r2 = Invoke-LlmTurn `
  -ShopName "Boutique Pink" -Category "เสื้อผ้า" `
  -Complaint "ลูกค้าสั่งผิดไซส์เอง ขอคืน/เปลี่ยน" `
  -Policy "ทางร้านไม่รับคืนสินค้าทุกกรณี" `
  -ContextLlm "ร้านเสื้อผ้าออนไลน์ มีตารางไซส์ระบุชัดเจน ลูกค้าไม่ได้เช็คก่อนสั่ง" `
  -CustomerTypeName "พลิก" -ToneDesc "เริ่มหวาน ใช้อิโมจิ 💕 น่ารัก แต่พอโดนปฏิเสธจะพลิกโกรธทันที ใช้ MANAGER" `
  -CustomerName "น้องพิม" -Mood 50 -Profit 100 -Turns 0 `
  -PlayerMessage "ขออภัยค่ะ ทางร้านมีนโยบายไม่รับคืนสินค้านะคะ"
Write-Host "Elapsed: $($r2.ElapsedSec)s  ParseOk: $($r2.ParseOk)"
Write-Host "Raw:`n$($r2.Raw)"
if ($r2.ParseOk) { Write-Host "Parsed: $($r2.Parsed | ConvertTo-Json -Compress)" }

# === Scenario 3: threat × food, player negotiates ===
Write-Host "`n=== SCENARIO 3: threat × food, player NEGOTIATES ==="
$r3 = Invoke-LlmTurn `
  -ShopName "ครัวพี่หญิง" -Category "อาหาร" `
  -Complaint "กินไปครึ่งกล่องแล้วบอกว่าไม่อร่อย ขอเงินคืน" `
  -Policy "อาหารปรุงสด ไม่รับคืน ยกเว้นปัญหาคุณภาพชัดเจน" `
  -ContextLlm "ร้านอาหารเดลิเวอรี่ ลูกค้ากินเองครึ่งกล่อง ไม่มีหลักฐานปัญหา" `
  -CustomerTypeName "ขู่" -ToneDesc "เสียงดุ ใช้คำขู่ ขู่ลงรีวิว/พันทิป น้ำเสียงทางการแต่กดดัน" `
  -CustomerName "คุณมิ้น" -Mood 18 -Profit 100 -Turns 1 `
  -PlayerMessage "ขออภัยค่ะ เดี๋ยวขอเสนอคูปองส่วนลด 200 บาทกับของแถมให้ค่ะ"
Write-Host "Elapsed: $($r3.ElapsedSec)s  ParseOk: $($r3.ParseOk)"
Write-Host "Raw:`n$($r3.Raw)"
if ($r3.ParseOk) { Write-Host "Parsed: $($r3.Parsed | ConvertTo-Json -Compress)" }

# === Summary ===
Write-Host "`n=== SUMMARY ==="
$all = @($r1, $r2, $r3)
$avgSec = [math]::Round(($all.ElapsedSec | Measure-Object -Average).Average, 2)
$jsonRate = ($all | Where-Object { $_.ParseOk }).Count
Write-Host "Avg response: ${avgSec}s"
Write-Host "JSON parse rate: $jsonRate / 3"
