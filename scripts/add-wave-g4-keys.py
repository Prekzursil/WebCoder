# One-shot: add the wave-G PR4 key family (items 95-100 — the class QR
# card) to every locale catalog. Re-run-safe (idempotent).
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCALES = ROOT / "src" / "locales"

K = {
    "qr_alt": {
        "en": "Class join QR code",
        "ro": "Cod QR de alăturare la clasă",
        "es": "Código QR para unirse a la clase",
        "fr": "Code QR pour rejoindre la classe",
        "de": "QR-Code zum Beitreten der Klasse",
        "pt": "QR code para entrar na turma",
        "it": "QR code per entrare nella classe",
        "ca": "Codi QR per unir-se a la classe",
        "nl": "QR-code om lid te worden van de klas",
        "pl": "Kod QR do dołączenia do klasy",
        "hu": "QR-kód az osztályhoz való csatlakozáshoz",
        "hr": "QR kod za pridruživanje razredu",
        "sr-Latn": "QR kod za pridruživanje razredu",
        "lt": "QR kodas prisijungimui prie klasės",
        "ru": "QR-код для входа в класс",
        "uk": "QR-код для приєднання до класу",
        "bg": "QR код за присъединяване към класа",
        "el": "QR code για είσοδο στην τάξη",
        "zh-Hans": "班级加入二维码",
        "zh-Hant": "班級加入 QR 碼",
        "ja": "クラス参加QRコード",
        "ko": "클래스 가입 QR 코드",
        "hi": "कक्षा में शामिल होने का QR कोड",
        "vi": "Mã QR tham gia lớp học",
        "th": "QR code สำหรับเข้าร่วมห้องเรียน",
        "id": "Kode QR bergabung ke kelas",
        "tr": "Sınıfa katılma QR kodu",
        "kk": "сыныпқа қосылу QR коды",
        "ar": "رمز QR للانضمام إلى الصف",
        "fa": "QR برای پیوستن به کلاس",
    },
    "qr_password_embed": {
        "en": "Embed the join password (stays on this device)",
        "ro": "Include parola de alăturare (rămâne pe acest dispozitiv)",
        "es": "Incluir la contraseña de unión (se queda en este dispositivo)",
        "fr": "Inclure le mot de passe (reste sur cet appareil)",
        "de": "Beitrittspasswort einbetten (bleibt auf diesem Gerät)",
        "pt": "Incluir a senha de entrada (fica neste dispositivo)",
        "it": "Includi la password di accesso (resta su questo dispositivo)",
        "ca": "Inclou la contrasenya (es queda en aquest dispositiu)",
        "nl": "Wachtwoord insluiten (blijft op dit apparaat)",
        "pl": "Osadź hasło dołączenia (zostaje na tym urządzeniu)",
        "hu": "Csatlakozási jelszó beágyazása (ezen az eszközön marad)",
        "hr": "Ugradi lozinku za pridruživanje (ostaje na ovom uređaju)",
        "sr-Latn": "Ugradi lozinku za pridruživanje (ostaje na ovom uređaju)",
        "lt": "Įdėk prisijungimo slaptažodį (lieka šiame įrenginyje)",
        "ru": "Встроить пароль входа (остаётся на этом устройстве)",
        "uk": "Вбудувати пароль приєднання (лишається на цьому пристрої)",
        "bg": "Вгради паролата за присъединяване (остава на това устройство)",
        "el": "Ενσωμάτωση κωδικού εισόδου (παραμένει στη συσκευή)",
        "zh-Hans": "嵌入加入密码（仅保留在此设备）",
        "zh-Hant": "嵌入加入密碼（僅保留在此裝置）",
        "ja": "参加パスワードを埋め込む（この端末にのみ保存）",
        "ko": "가입 비밀번호 포함 (이 기기에만 저장)",
        "hi": "जुड़ने का पासवर्ड एम्बेड करें (इसी डिवाइस पर रहता है)",
        "vi": "Nhúng mật khẩu tham gia (chỉ giữ trên thiết bị này)",
        "th": "ฝังรหัสเข้าร่วม (อยู่บนอุปกรณ์นี้เท่านั้น)",
        "id": "Sematkan kata sandi gabung (tetap di perangkat ini)",
        "tr": "Katılma şifresini göm (bu cihazda kalır)",
        "kk": "қосылу құпиясөзін ендір (осы құрылғыда қалады)",
        "ar": "تضمين كلمة مرور الانضمام (تبقى على هذا الجهاز)",
        "fa": "جاسازی رمز پیوستن (فقط روی این دستگاه می‌ماند)",
    },
    "qr_scan_hint": {
        "en": "Students scan to join",
        "ro": "Elevii scanează pentru a se alătura",
        "es": "Los estudiantes escanean para unirse",
        "fr": "Les élèves scannent pour rejoindre",
        "de": "Schüler scannen zum Beitreten",
        "pt": "Alunos escaneiam para entrar",
        "it": "Gli studenti scansionano per entrare",
        "ca": "L'alumnat escaneja per unir-se",
        "nl": "Leerlingen scannen om lid te worden",
        "pl": "Uczniowie skanują, aby dołączyć",
        "hu": "A diákok beolvasva csatlakoznak",
        "hr": "Učenici skeniraju za pridruživanje",
        "sr-Latn": "Učenici skeniraju za pridruživanje",
        "lt": "Mokiniai nuskaito, kad prisijungtų",
        "ru": "Ученики сканируют, чтобы присоединиться",
        "uk": "Учні сканують, щоб приєднатися",
        "bg": "Учениците сканират, за да се присъединят",
        "el": "Οι μαθητές σκανάρουν για να εισέλθουν",
        "zh-Hans": "学生扫码加入",
        "zh-Hant": "學生掃碼加入",
        "ja": "生徒はスキャンして参加",
        "ko": "학생이 스캔하여 가입",
        "hi": "छात्र शामिल होने के लिए स्कैन करते हैं",
        "vi": "Học sinh quét mã để tham gia",
        "th": "นักเรียนสแกนเพื่อเข้าร่วม",
        "id": "Siswa memindai untuk bergabung",
        "tr": "Öğrenciler katılmak için tarar",
        "kk": "оқушылар қосылу үшін сканерлейді",
        "ar": "يمسح الطلاب للانضمام",
        "fa": "دانش‌آموزان برای پیوستن اسکن می‌کنند",
    },
}


def main() -> None:
    for locale_file in sorted(LOCALES.glob("*.json")):
        code = locale_file.stem
        data = json.loads(locale_file.read_text(encoding="utf-8"))
        changed = False
        for key, translations in K.items():
            if key not in data:
                data[key] = translations.get(code, translations["en"])
                changed = True
        if changed:
            locale_file.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
    print("qr keys restored")


if __name__ == "__main__":
    main()
