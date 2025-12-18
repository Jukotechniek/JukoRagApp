# Stap-voor-stap: Firewall Regel Toevoegen

## Het Probleem
Je firewall staat AAN en blokkeert binnenkomende verbindingen standaard. Daarom kan je telefoon niet verbinden.

## Oplossing: Specifieke Regel Toevoegen

### Stap 1: Open Firewall Advanced Settings
1. Druk op `Windows + R`
2. Type: `wf.msc`
3. Druk Enter

### Stap 2: Maak Inbound Rule
1. In het linker menu, klik op **"Inbound Rules"**
2. Klik rechts op **"New Rule..."** (of in het rechter menu: "Inbound Rules" → "New Rule...")

### Stap 3: Configureer de Regel
1. **Rule Type:**
   - Selecteer **"Port"**
   - Klik **Next**

2. **Protocol and Ports:**
   - Selecteer **"TCP"**
   - Selecteer **"Specific local ports"**
   - Type: **`8080`**
   - Klik **Next**

3. **Action:**
   - Selecteer **"Allow the connection"**
   - Klik **Next**

4. **Profile:**
   - ✅ Vink **Domain** aan
   - ✅ Vink **Private** aan
   - ✅ Vink **Public** aan
   - Klik **Next**

5. **Name:**
   - Name: **"Vite Dev Server Port 8080"**
   - Description (optioneel): "Allow Vite development server on port 8080"
   - Klik **Finish**

### Stap 4: Herstart Dev Server
Stop je huidige server (Ctrl+C) en start opnieuw:
```bash
npm run dev
```

### Stap 5: Test op Telefoon
Open op je telefoon (op hetzelfde WiFi netwerk):
```
http://192.168.68.130:8080
```

## Alternatief: Tijdelijk Binnenkomende Verbindingen Toestaan

Als je snel wilt testen (minder veilig):

1. In de firewall instellingen die je laat zien
2. Klik op "Binnenkomende verbindingen" dropdown
3. Kies **"Toestaan (standaard)"** in plaats van "Blokkeren (standaard)"
4. Klik **OK**

⚠️ **Let op:** Dit is minder veilig! Zet het daarna weer terug op "Blokkeren (standaard)" en voeg de specifieke regel toe.

## Waarom werkt het nu niet?

- Firewall staat AAN ✅
- Binnenkomende verbindingen: **BLOKKEEREN** ❌
- Er is geen specifieke regel voor poort 8080 ❌

Daarom worden alle verbindingen vanaf je telefoon geblokkeerd!






