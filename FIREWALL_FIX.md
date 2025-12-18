# Firewall Fix voor Netwerk Toegang

## Probleem
Je kunt de website niet openen vanaf je telefoon, ook al staat de firewall uit.

## Oplossing

### Stap 1: Windows Defender Firewall Regel Toevoegen

1. **Open Windows Defender Firewall** (ook al staat je andere firewall uit)
   - Druk op `Windows + R`
   - Type: `wf.msc` en druk Enter
   - Of zoek "Windows Defender Firewall with Advanced Security"

2. **Maak een nieuwe Inbound Rule:**
   - Klik rechts op "Inbound Rules"
   - Klik "New Rule..."
   - Kies "Port" → Next
   - Kies "TCP"
   - Kies "Specific local ports" en type: `3000`
   - Klik Next
   - Kies "Allow the connection" → Next
   - Vink ALLE drie aan: Domain, Private, Public → Next
   - Geef een naam: "Vite Dev Server Port 8080"
   - Klik Finish

3. **Herhaal voor Outbound Rules** (optioneel, maar aanbevolen):
   - Klik rechts op "Outbound Rules"
   - Herhaal dezelfde stappen

### Stap 2: Controleer Netwerk Profiel

1. Open "Network and Sharing Center"
2. Klik op je actieve netwerk (WiFi of Ethernet)
3. Zorg dat het netwerk als "Private" is ingesteld (niet "Public")
   - Public netwerken hebben strengere firewall regels

### Stap 3: Herstart Dev Server

Stop de huidige server (Ctrl+C) en start opnieuw:
```bash
npm run dev
```

### Stap 4: Test op Telefoon

Gebruik dit IP-adres op je telefoon (op hetzelfde WiFi netwerk):
```
http://192.168.68.130:8080
```

**Belangrijk:**
- Gebruik `http://` niet `https://`
- Gebruik het IP-adres, niet `localhost`
- Zorg dat je telefoon op hetzelfde WiFi netwerk zit

### Stap 5: Als het nog steeds niet werkt

1. **Test of de poort open is:**
   - Op je PC: open `http://localhost:8080` (moet werken)
   - Op je telefoon: probeer `http://192.168.68.130:8080`

2. **Controleer of beide apparaten op hetzelfde netwerk zitten:**
   - PC IP: `192.168.68.130`
   - Telefoon IP moet ook `192.168.68.x` zijn (niet `192.168.1.x` of anders)

3. **Tijdelijk Windows Firewall uitschakelen om te testen:**
   - Ga naar Windows Defender Firewall
   - Klik "Turn Windows Defender Firewall on or off"
   - Zet beide (Private en Public) tijdelijk uit
   - Test opnieuw
   - **Zet het daarna weer aan!**

4. **Check router firewall:**
   - Sommige routers hebben een ingebouwde firewall
   - Check je router instellingen

### Alternatief: Gebruik een andere poort

Als poort 8080 problemen geeft, probeer poort 3000:

```typescript
// vite.config.ts
server: {
  host: "0.0.0.0",
  port: 3000, // Verander naar 3000
}
```

En voeg dan een firewall regel toe voor poort 3000.









