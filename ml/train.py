"""
train.py — trains the logistic regression model used by the browser extension.
Run: python train.py --data emails.csv --out ../ml/model.json

CSV columns required:
  subject, body, links (pipe-joined), sender_name, sender_email,
  attachments (pipe-joined), label (0 = legit, 1 = phishing)

Install: pip install scikit-learn pandas
"""
import argparse, json, math, re, sys
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score

FEATURES = [
    "has_urgency","has_password_word","has_money_word","has_brand_mismatch",
    "has_ip_url","has_punycode","has_suspicious_tld","has_shortener",
    "link_count_log","body_length_log","uppercase_ratio","exclamation_ratio",
    "has_attachment_risky","has_macro_ext","has_double_ext","has_form_tag",
    "has_hidden_text","has_qr_image","display_name_spoof","reply_to_mismatch",
    "first_seen_sender","thread_history_flag","arabic_urgency","arabic_keyword",
    "html_script_tag","html_iframe","has_base64_image","many_links_ratio",
    "url_entropy_avg","url_brand_path"
]

BRANDS = ["google","microsoft","apple","amazon","paypal","facebook","instagram",
          "netflix","bank","dhl","fedex","ups","linkedin","outlook","yahoo",
          "bankmuscat","omanair","omantel"]
SUSP_TLD = [".ru",".cn",".tk",".top",".xyz",".gq",".ml",".cf",".ga",".zip",".mov","loan","work"]
SHORTENERS = ["bit.ly","t.co","tinyurl.com","goo.gl","ow.ly","is.gd","buff.ly","cutt.ly"]

def entropy(s):
    if not s: return 0
    from collections import Counter
    c = Counter(s)
    n = len(s)
    return -sum((v/n) * math.log2(v/n) for v in c.values())

def featurize(row):
    text = f"{row.get('subject','')} {row.get('body','')}".lower()
    links = [u for u in str(row.get('links','')).split('|') if u.strip()]
    atts = [a.lower() for a in str(row.get('attachments','')).split('|') if a.strip()]
    f = {}
    f["has_urgency"] = int(bool(re.search(r"urgent|immediate|within 24|act now|final warning", text)))
    f["has_password_word"] = int("password" in text or "كلمة المرور" in text)
    f["has_money_word"] = int(bool(re.search(r"payment|bank|invoice|wire|bitcoin|transfer|دفع|بنك", text)))
    f["has_brand_mismatch"] = int(any(b in text for b in BRANDS) and any(b not in " ".join(links) for b in BRANDS if b in text))
    f["has_ip_url"] = int(any(re.match(r"https?://\d+\.\d+\.\d+\.\d+", u) for u in links))
    f["has_punycode"] = int(any("xn--" in u for u in links))
    f["has_suspicious_tld"] = int(any(any(u.endswith(t) or f"{t}/" in u for t in SUSP_TLD) for u in links))
    f["has_shortener"] = int(any(any(s in u for s in SHORTENERS) for u in links))
    f["link_count_log"] = math.log(1 + len(links))
    f["body_length_log"] = math.log(1 + len(text))
    f["uppercase_ratio"] = sum(1 for c in text if c.isupper()) / max(1, len(text))
    f["exclamation_ratio"] = text.count("!") / max(1, len(text))
    f["has_attachment_risky"] = int(any(a.endswith(tuple(f".{e}" for e in ["exe","scr","js","vbs","bat","cmd","jar","hta","lnk","iso"])) for a in atts))
    f["has_macro_ext"] = int(any(a.endswith(tuple(f".{e}" for e in ["docm","xlsm","pptm"])) for a in atts))
    f["has_double_ext"] = int(any(re.search(r"\.(pdf|doc|docx|xls|xlsx|jpg|png|txt|zip)\.(exe|scr|js|vbs|bat)$", a) for a in atts))
    f["has_form_tag"] = 0
    f["has_hidden_text"] = 0
    f["has_qr_image"] = 0
    f["display_name_spoof"] = int(bool(row.get('sender_name')) and any(b in str(row['sender_name']).lower() and b not in str(row.get('sender_email','')).lower() for b in BRANDS))
    f["reply_to_mismatch"] = 0
    f["first_seen_sender"] = 0
    f["thread_history_flag"] = 0
    f["arabic_urgency"] = int(bool(re.search(r"عاجل|تحقق الآن|تصرف الآن|فرصة أخيرة", text)))
    f["arabic_keyword"] = int(bool(re.search(r"حساب|كلمة المرور|فاتورة|بنك|دفع", text)))
    f["html_script_tag"] = 0
    f["html_iframe"] = 0
    f["has_base64_image"] = 0
    f["many_links_ratio"] = int(len(links) > 5)
    f["url_entropy_avg"] = (sum(entropy(u) for u in links) / len(links) / 8) if links else 0
    f["url_brand_path"] = f["has_brand_mismatch"]
    return [f[name] for name in FEATURES]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="../ml/model.json")
    args = ap.parse_args()

    df = pd.read_csv(args.data)
    X = np.array([featurize(row) for _, row in df.iterrows()])
    y = df["label"].astype(int).values

    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    clf = LogisticRegression(max_iter=2000, class_weight="balanced")
    clf.fit(Xtr, ytr)

    pred = clf.predict(Xte)
    proba = clf.predict_proba(Xte)[:, 1]
    print(classification_report(yte, pred))
    print("ROC-AUC:", roc_auc_score(yte, proba))

    model = {
        "version": "1.0.0",
        "algorithm": "logistic_regression",
        "features": FEATURES,
        "bias": float(clf.intercept_[0]),
        "weights": [float(w) for w in clf.coef_[0]],
    }
    with open(args.out, "w") as f:
        json.dump(model, f, indent=2)
    print(f"Wrote {args.out}")

if __name__ == "__main__":
    main()