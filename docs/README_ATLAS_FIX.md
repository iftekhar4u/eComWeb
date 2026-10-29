# AURELIA: Atlas par naya data save karna

Yeh existing InternProject ke liye patch hai, naya standalone project nahi.

## Tumhare code mein kya mila

- Admin settings mein saved aur selected Atlas host `cluster0.fqqnrdx.mongodb.net` hai; database `aurelia_dev` hai.
- Backend startup selected URI ko apply karta hai. Products, users, orders aur content usi Mongoose connection ko use karte hain. Is flow mein automatic local fallback nahi hai.
- Tumhara pehle bheja hua `Database connected successfully` log us run mein Atlas connection successful hone ka evidence hai. Woh log har nayi save ya poori purani migration ki verification nahi hai.
- Purana `npm run db:diagnose` admin-selected Atlas ko ignore karke `.env` database check karta tha. Patch is mismatch ko fix karta hai.

## Ab yeh 5 steps karo

1. Frontend/backend ke purane running terminals mein `Ctrl+C` karo. Apne current source files ka backup rakh lo.
2. Patch ZIP extract karo. Iske **backend** aur **frontend** folders ko apne existing `C:\Users\qadir\OneDrive\Desktop\InternProject` folder mein copy/merge karo; matching files ke liye **Replace** choose karo. Existing folders delete mat karna. Is ZIP mein `.env`, `.private`, credentials, dependencies ya database dump nahi hain. Existing `backend/.env` aur `backend/.private/integrations.enc` ko wahi rehne do.
3. Existing project root ke PowerShell mein run karo:

   ```powershell
   cd "C:\Users\qadir\OneDrive\Desktop\InternProject"
   node admin-tools/start.mjs
   ```

   Yeh backend aur frontend dono start karta hai. Inke saath alag se doosra `npm run dev` mat chalao.

4. `http://localhost:5173/admin/settings` kholo aur login karo. Neeche **MongoDB Atlas → Running database** mein yeh verify karo:

   ```text
   Connected to Atlas
   Host: cluster0.fqqnrdx.mongodb.net
   Database: aurelia_dev
   ```

   Tumhare supplied ZIP mein Atlas already selected tha. Agar upar yahi host/database aata hai, credentials ko dobara save/select karne ki zaroorat nahi hai.

5. Admin → Products se ek naya **draft** product banao. Name `Atlas Check`, slug `atlas-check`, aur unique SKU use karo; required category, price, stock aur HTTPS image URL bhi fill karo. **Save changes** successful hone ke baad Settings mein **Refresh database status** dabao. Latest product mein wahi slug/ID dikhna chahiye. Atlas ke sahi project/cluster ke **Data Explorer → aurelia_dev → products** mein Filter lagao aur **Find** dabao:

   ```json
   { "slug": "atlas-check" }
   ```

   Agar yeh slug pehle se hai toh naya unique slug lo aur filter mein wahi use karo. `updatedAt` aur Document ID match karo. Draft bhi database mein save hota hai; storefront par dikhane ke liye Published status chahiye.

Is record ke Atlas mein milne par naya admin save cloud mein jaane ka direct proof mil jayega. Iske baad successful admin saves seedha selected Atlas database mein jayenge; har save par mongorestore ya push command nahi chalani hai.

## Agar abhi bhi record nahi dikhe

| Jo dikh raha hai | Agla step |
| --- | --- |
| New Running database panel hi nahi hai | Patch existing project mein copy hua hai ya nahi check karo; usi folder se start karo aur browser reload karo. |
| Status mein `127.0.0.1` hai | Is running backend ki selection local hai. Isi Settings page par saved Atlas test karo. Current data copy verify hone par existing confirmation + current admin password ke saath Select saved Atlas for next restart use karo, phir backend restart karo. `.env` mein recovery override enabled ho toh README_INTEGRATIONS.md ke recovery steps follow karo. |
| Connected to Atlas, par save par error aata hai | Product form ka exact error dekho. Connection success se form validation, unique slug/SKU aur write permission automatically verify nahi hote. |
| Status mein naya product hai, Atlas screen par nahi | Atlas mein host ko cluster ke Connect dialog se match karo; `aurelia_dev.products` select karo, purana filter clear karke exact slug se Find karo. |
| IP/network connection error | Atlas → Network Access mein backend chalane wale computer ka current public IP allow karo, phir restart karo. |
| Authentication failed | Atlas Database Access wale database user/password aur URI encoding check karo. Atlas website login password alag hota hai. |

Status read-only hai: yeh running app ke connection se primary par product count/latest product padhta hai. Yeh permissions ke liye fake write, data migration ya connection switch nahi karta.

Optional terminal check, **backend** folder se:

```powershell
cd "C:\Users\qadir\OneDrive\Desktop\InternProject\backend"
npm run db:diagnose
```

Ab yeh command bhi admin selection apply karke `host`, `database`, `atlas`, `productCount`, `latestProduct` aur collection details dikhati hai. Yeh naya process hai: pending selection ho toh running server restart karna abhi bhi zaroori hai. Output/error share kar sakte ho; password/URI share mat karna.

## Existing data aur files

- Backup/restore ek time ki copy thi. Uske baad local database mein hue changes automatically Atlas mein merge nahi hote. Agar aise records hain toh original local database aur backup sambhal kar rakho; populated Atlas par dobara blind restore ya `--drop` mat chalao. Pehle missing records/edits compare karne honge.
- Product/category/user/order/content documents MongoDB mein hain. Normal local image files MongoDB dump ka part nahi hain; is project ke Cloudinary integration se upload hui images Cloudinary par aur unke URLs MongoDB mein rehte hain.
- Atlas connection credentials aur WhatsApp/Cloudinary integration configuration encrypted `backend/.private/integrations.enc` file mein hain. Unhe MongoDB connect hone se pehle read karna hota hai. Future deployment par isi private file aur original encryption key ko securely preserve karna zaroori hai.
- Chat mein share hua database password rotate karke saved connection update karo. Existing `MFA_ENCRYPTION_KEY` ko randomly replace mat karna: usse saved integrations/authenticator decrypt nahi honge.

## Patch aur verification

- Admin Settings mein actual running host/database, successful read time, product count aur latest product add kiya.
- Startup aur Atlas test errors ko authentication/DNS/TLS/permissions/network categories mein sanitize kiya; full URI/password log nahi hote.
- Backend selection timeout 5 se 30 seconds kiya.
- Database diagnostic ab startup wala same selection resolver use karta hai.
- Existing activation, reauthentication, CSRF aur migration safeguards preserve kiye.

16 targeted backend tests pass hue aur frontend Vite production build pass hua. Tests isolated fixtures par run hue; user ke live Atlas/local database se connect karke writes ya migration nahi chalayi gayi. User ke Windows par final save verification upar step 5 se hogi.

Official references:
- https://www.mongodb.com/docs/atlas/atlas-ui/query/filter/
- https://www.mongodb.com/docs/atlas/troubleshoot-connection/
- https://mongoosejs.com/docs/connections.html
