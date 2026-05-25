# SimFlightPro — Guia do Jogador

Guia completo para usar o simulador de voo. Cobre todos os controles, indicadores do HUD, autopilot, câmaras, missões e sistemas auxiliares.

---

## 1. Visão Geral

O SimFlightPro é um simulador de voo em tempo real no navegador, com física aerodinâmica completa, terreno satelital 3D do mundo todo, multiplayer, missões, sistema de progressão por rank e marketplace de aeronaves.

Pode-se jogar em **desktop** (teclado + rato + gamepad opcional) ou em **mobile/tablet** (joystick virtual + sliders).

Os voos são gravados automaticamente — distância, tempo, altitude máxima, taxa de aterragem (touchdown rate), aeroporto de partida e chegada. Aterragens geram pontos; missões cumpridas dão recompensas adicionais.

---

## 2. Como Começar

1. **Faça login** na sua conta SimFlightPro.
2. Abra o simulador (botão *Fly* ou *Voar*) — o jogo carrega o terreno 3D do mundo real à volta do aeroporto de partida.
3. Aguarde o terreno e a aeronave aparecerem (cinematica de spawn).
4. Após a câmara assentar, está livre para descolar.
5. Recomendado para iniciantes: ativar **Easy Mode** (tecla `M`) antes do primeiro voo.

### Spawn

- **Spawn no solo**: aeronave começa parada no aeroporto, motor ao ralenti, flaps na posição de descolagem, gear baixo. Avance throttle (`W`) para descolar.
- **Spawn em voo (missões)**: a aeronave aparece em altitude com velocidade de cruzeiro, gear recolhido (se retrátil), flaps neutros, throttle a ~55%.

---

## 3. Aeronaves

O simulador suporta múltiplas aeronaves com físicas independentes — Cessna 172, Bombardier Learjet 45, Douglas DC-8 e outras adicionadas no marketplace.

### Tipos de motor

| Tipo | Exemplos | Características |
|------|----------|-----------------|
| Pistão | Cessna 172 | Hélice fixa/variável, mixture, magnetos, RPM máximo ~2700 |
| Turboélice | Caravan, Tucano | Hélice movida por turbina, resposta de throttle rápida |
| Turbojato | Concorde | Empuxo alto, eficiência baixa em baixa altitude |
| Turbofan | DC-8, Learjet 45 | Eficiente em altitude, spool-up lento |
| Elétrico | (futuro) | Resposta instantânea, sem mixture nem magnetos |

### Trem de pouso (retrátil vs. fixo)

Aeronaves de gear **fixo** (Cessna 172, Caravan) **não** podem recolher o trem — a tecla `G` e o botão touch ficam desativados.

Aeronaves de gear **retrátil** (DC-8, Learjet 45, Concorde, Tucano, Cessna 210) podem recolher após a descolagem para reduzir arrasto.

### Trocar de aeronave

Use o botão **Aircraft** no canto superior direito (ícone de avião) para selecionar uma aeronave do seu hangar. A aeronave atual é recarregada com o modelo 3D, física e som correspondentes.

---

## 4. Interface (HUD) — Todos os Elementos

### 4.1 Painel Esquerdo (IRSPD + Motor)

| Elemento | Descrição |
|----------|-----------|
| **IRSPD (KTS)** | Velocidade indicada em nós (IAS). Tape vertical com ticker numérico. |
| **IAS** | Indicated Air Speed (corrigida pela densidade do ar) |
| **TAS** | True Air Speed (real no ar) |
| **GS** | Ground Speed (sobre o terreno, inclui vento) |
| **RPM** | Rotação do motor #1 (mostrador analógico) |
| **FUEL** | Combustível restante em % |
| **AOA** | Angle of Attack (ângulo de ataque em graus) |
| **THR%** | Percentagem de throttle aplicado |
| **AB** | Etiqueta vermelha quando afterburner ativo |
| **ENGINE #2/#3/#4** | Colunas adicionais aparecem em aeronaves multi-motor (DC-8 tem 4) |

### 4.2 Painel Central (Attitude Indicator / PFD)

| Elemento | Descrição |
|----------|-----------|
| **Linha do horizonte** | Pitch e roll do avião relativo ao horizonte |
| **Escala de pitch** | Graus de pitch (positivo = nariz para cima) |
| **Heading tape** | Bússola superior — heading magnético do avião |
| **Velocidade lateral (esquerda)** | Velocidade IAS em verde |
| **Altitude (direita)** | Altitude em pés |
| **STALL** | Alerta vermelho pulsante — perda de sustentação iminente |

### 4.3 Painel Direito (Altitude + Instrumentos)

| Elemento | Descrição |
|----------|-----------|
| **ALTITUDE (FT)** | Altitude em pés (tape vertical) |
| **5000** (em cima) | Altitude alvo do autopilot (selected altitude) |
| **29.92 IN** | Pressão barométrica de referência |
| **VS** | Vertical Speed em pés/minuto (positivo = a subir) |
| **FLAPS** | Posição atual dos flaps (graus ou OFF) |
| **BRK** | ON/OFF — travões a pressionar |
| **GEAR** | DOWN / UP / IN TRANSIT (só aparece se retrátil) |
| **TRIM** | Posição do trim de profundidade (-15% a +15%) |
| **THR** | Barra horizontal de throttle |
| **AP** | Estado do autopilot (OFF / HDG / NAV / APR) |
| **SPL** | Estado dos spoilers (--, ARM, ACT) |
| **ENG** | Estado dos motores (OK / FAIL) |
| **HDG** | Heading magnético atual em graus |
| **ATT** | Atitude curta — GROUND / CLIMB / DESC / LEVEL |

### 4.4 Painel de Autopilot (canto superior direito)

| Elemento | Descrição |
|----------|-----------|
| **AP** | Master autopilot — liga/desliga todos os modos |
| **NAV** | Segue waypoint da missão / flight plan |
| **APR** | Approach — captura runway final (LOC + GS) |
| **HDG** | Mantém heading definido |
| **ALT** | Mantém altitude definida |
| **VS** | Mantém velocidade vertical definida |
| **Display HDG / ALT / VS** | Valores alvo — clique para editar manualmente |
| **Knobs (roda de scroll)** | Ajuste rápido: scroll = ±1, Shift+scroll = ±10, clique direito = decrementa |

### 4.5 Topo (status global)

| Elemento | Descrição |
|----------|-----------|
| **45 FPS** | Taxa de quadros atual |
| **WS time** | Latência do servidor multiplayer |
| **20.00x** | Time scale (aceleração de tempo) |
| **PAUSED** | Visível quando jogo pausado |
| **AT 161kt** | Autothrottle ativo + velocidade alvo |
| **UTC clock** | Hora UTC e data |
| **N ONLINE** | Jogadores online próximos |

### 4.6 Minimapa GPS (canto superior esquerdo)

- Vista satelital com heading do avião apontando para cima
- Botões `+`/`-` para zoom
- Botão de modo: heading-up ou north-up
- Coordenadas lat/lon do avião
- Marcadores: aeroporto de partida (verde), destino (laranja), waypoints (amarelo), outros jogadores (azul)

### 4.7 Painel de Navegação (NAV) — abaixo do minimapa

Visível quando um waypoint ou destino está ativo:

| Campo | Descrição |
|-------|-----------|
| **WPT** | Nome do waypoint ativo |
| **LEG** | Número da perna atual da rota |
| **DIST** | Distância até ao waypoint (nm ou km, conforme unidade) |
| **BRG** | Bearing magnético até ao waypoint |
| **HDGΔ** | Diferença entre heading atual e bearing desejado |
| **XTE** | Cross-Track Error (desvio lateral da rota) — barra visual |
| **TGT** | Altitude alvo no waypoint |
| **ETE** | Estimated Time En-route até ao waypoint |
| **ETA** | Estimated Time of Arrival (hora UTC) |
| **DEST** | Nome do destino final |
| **TOTAL** | Distância total restante |
| **WIND** | Vento atual (direção/velocidade) |
| **GS** | Ground speed |

### 4.8 Botões laterais (direita)

| Botão | Função |
|-------|--------|
| ⚙ (gear) | Settings / Painel de debug |
| ✈ (avião) | Selecionar aeronave |
| 📋 (folha) | Missões disponíveis |
| 🗺 (mapa) | Flight plans |

---

## 5. Controles de Teclado (Desktop)

Todas as teclas podem ser reconfiguradas em **Settings → Controls** (atalho `Shift+D`).

### 5.1 Controles primários de voo

| Tecla | Ação |
|-------|------|
| `W` | Throttle + (aumenta empuxo) |
| `S` | Throttle − (reduz empuxo) |
| `↑` | Pitch down (nariz baixa) |
| `↓` | Pitch up (nariz sobe) |
| `←` | Roll esquerda |
| `→` | Roll direita |
| `Q` / `A` | Yaw esquerda (leme) |
| `E` / `D` | Yaw direita (leme) |

### 5.2 Configurações de aerodinâmica

| Tecla | Ação |
|-------|------|
| `5` | Flaps − (recolhe um passo) |
| `6` | Flaps + (estende um passo) |
| `7` | Trim pitch − (nariz baixa) |
| `8` | Trim pitch + (nariz sobe) |
| `9` | Trim yaw esquerda |
| `0` | Trim yaw direita |
| `PageUp` | Trim pitch + (passo grande) |
| `PageDown` | Trim pitch − (passo grande) |
| `\` (barra invertida) | Spoilers — toggle |
| `Shift+\` | Spoilers — arma (deploy automático ao tocar no solo) |

### 5.3 Trem de pouso e travões

| Tecla | Ação |
|-------|------|
| `G` | Trem de pouso (UP / DOWN) — só funciona em aeronaves retráteis |
| `B` | Travões — toggle |

### 5.4 Motores (aeronaves de pistão)

| Tecla | Ação |
|-------|------|
| `=` | Mixture + (mistura mais rica) |
| `−` | Mixture − (mistura mais pobre) |
| `N` | Magneto cycle (OFF → R → L → BOTH) |

### 5.5 Kill engines (qualquer aeronave)

| Tecla | Ação |
|-------|------|
| `1` | Apaga/Religa motor #1 |
| `2` | Apaga/Religa motor #2 |
| `3` | Apaga/Religa motor #3 |
| `4` | Apaga/Religa motor #4 |

### 5.6 Autopilot

| Tecla | Ação |
|-------|------|
| `Z` | AP Master — liga/desliga autopilot |
| `F` | HDG Hold — mantém heading atual |
| `J` | ALT Hold — mantém altitude atual |
| `K` | VS Hold — mantém velocidade vertical atual |
| `U` | NAV Hold — segue waypoint |
| `I` | APR Hold — modo approach |
| `H` | Autothrottle — mantém velocidade IAS |

> O autopilot **desengata automaticamente** se o piloto mover muito stick (pitch/roll/yaw) — segurança. Para reengatar, prima `Z` novamente.

### 5.7 Câmara

| Tecla | Ação |
|-------|------|
| `C` | Cicla câmara (Chase → Cockpit → External Fixed → Flyby → Tower) |
| `T` | Câmara da torre (vista de aeroporto) |
| Mouse (drag) | Orbita câmara à volta do avião (modo chase) |
| Scroll | Zoom in/out |
| `Y` | Mouse Yoke — ativa controlo do avião pelo rato (substitui setas) |

#### Modos de câmara

1. **Chase** — Atrás do avião, segue movimento (default).
2. **Cockpit** — Vista interna do piloto.
3. **External Fixed** — Vista externa, ângulo fixo do mundo.
4. **Flyby** — Câmara estática a passar (cinemática).
5. **Tower** — Vista da torre de controlo do aeroporto mais próximo.

### 5.8 Sistema e diversos

| Tecla | Ação |
|-------|------|
| `P` | Pausa / despausa |
| `[` | Time scale − (reduz aceleração) |
| `]` | Time scale + (aumenta até 32x) |
| `M` | Easy Mode — ativa estabilização e auto-throttle |
| `R` | Respawn (reaparece no aeroporto de partida) |
| `F12` | Screenshot (gera PNG da viewport) |
| `Shift+D` | Painel de debug/settings |

---

## 6. Controles Mobile / Touch

Em dispositivos com touch, controles virtuais aparecem automaticamente.

### 6.1 Joystick virtual

- **Toque e arraste** em qualquer lugar do écran (exceto sobre widgets) — o joystick aparece no ponto do toque.
- **Cima/baixo** = pitch; **esquerda/direita** = roll.
- Largue para centrar (retorno automático).

Configuração em **botão ⚙ (canto superior direito)**:
- **Raio** — tamanho do joystick (40–120 px)
- **Zona morta** — área central insensível (0–30%)
- **Curva (expo)** — sensibilidade não-linear (1.0 linear, >1 mais suave no centro)
- **Inverter pitch** — para preferência de controle invertido

### 6.2 Throttle slider (canto inferior esquerdo)

Slider vertical com barra verde — arraste para cima/baixo para ajustar empuxo (0–100%).

### 6.3 Botões touch (acima do throttle)

| Botão | Função |
|-------|--------|
| **F+** | Flaps + |
| **F−** | Flaps − |
| **GR▼ / GR▲** | Trem de pouso (verde = DOWN, cinza = UP, amarelo = transit). Escondido em aeronaves de gear fixo. |
| **BRK** | Travões — toggle (vermelho quando ativo) |
| **SPL** | Spoilers — toggle (verde = ativo, amarelo = armado). Toque longo (500ms) = arma para auto-deploy. |
| **LGT** | Luzes de pouso — toggle |

### 6.4 Gestos com dois dedos

- **Pinça (dois dedos a juntar/afastar)** — ajusta throttle finamente.
- **Swipe com dois dedos** — cicla câmara.

### 6.5 Painéis de jogo (mobile)

Botões pequenos no canto superior direito abrem painéis sobrepostos:
- ⚙ Settings
- ✈ Aircraft selection
- 📋 Missions
- 🗺 Flight plans

Os painéis são **arrastáveis** (drag pela barra superior), **redimensionáveis** (canto inferior direito) e **fixáveis** (botão ○ → ● fica sempre visível).

---

## 7. Autopilot (AP) Detalhado

### 7.1 Como engatar

1. Prima `Z` ou clique no botão **AP** — o master liga.
2. Prima um modo lateral: `F` (HDG), `U` (NAV) ou `I` (APR).
3. Prima um modo vertical: `J` (ALT) ou `K` (VS).
4. Opcional: prima `H` para autothrottle (velocidade automática).

> Ao engatar **HDG**, o AP captura o heading atual do avião como alvo. Para mudar, role o knob HDG no painel ou clique no display para escrever o valor.

### 7.2 Modos

| Modo | Função | Atalho |
|------|--------|--------|
| **AP** | Master switch — liga o autopilot |
| **HDG** | Mantém heading definido (0–359°) | `F` |
| **NAV** | Segue waypoint atual da rota com correção de XTE | `U` |
| **APR** | Approach — segue ILS final (localizer + glideslope) | `I` |
| **ALT** | Mantém altitude (0–50,000 ft) | `J` |
| **VS** | Mantém razão de subida/descida (−3000 a +3000 fpm) | `K` |
| **AT** | Autothrottle — mantém IAS alvo (Mach em altitude) | `H` |

### 7.3 Ajustar valores alvo

**Via knob (rato)**:
- Scroll para cima/baixo no knob = ±1 unidade
- Shift+scroll = ±10 (passo grande)
- Clique direito = decrementa
- Clique esquerdo = incrementa

**Via display (escrever)**:
- Clique no número (HDG, ALT, VS)
- Digite o valor desejado
- Enter para confirmar

### 7.4 Desengate automático

O AP desengata sozinho se:
- Mover stick além de ~30% (proteção contra conflito de inputs)
- Aeronave entra em stall severo
- Aeronave toca no solo com gear

---

## 8. Easy Mode (`M`)

Modo simplificado para iniciantes:
- **Estabilização automática** — corrige pitch e roll suavemente
- **Auto-throttle** — mantém velocidade segura
- Reduz sensibilidade dos controles

Ideal para o primeiro voo ou para uso casual em mobile. Pode ser combinado com autopilot.

---

## 9. Trim

O trim ajusta a posição neutra das superfícies de controlo — útil para manter altitude/heading sem segurar stick.

- **Pitch trim** (`7`/`8` ou `PageUp`/`PageDown`): −15% a +15%. Positivo = nariz cima.
- **Yaw trim** (`9`/`0`): −10% a +10%. Compensa empuxo assimétrico em multi-motor.

O valor atual aparece no HUD como **TRIM**.

---

## 10. Flaps

| Passo | Graus típicos | Uso |
|-------|---------------|-----|
| 0 | 0° (OFF) | Cruzeiro |
| 1 | 5° | Descida rápida |
| 2 | 15° | Descolagem / aproximação |
| 3 | 25° | Aproximação final |
| 4 | 30° | Curta final |
| 5 | 40° | Aterragem |

**Atenção**: estender flaps acima da velocidade VFE (Flap Extended Speed) causa danos — verifique a velocidade máxima da sua aeronave nos manuais.

---

## 11. Trem de Pouso (Landing Gear)

- Recolha após atingir velocidade segura pós-descolagem (~80–150 kt dependendo da aeronave).
- Estenda antes da aproximação final (a tempo de o GPWS avisar "TOO LOW GEAR" se esquecer).
- **GPWS** monitoriza altura sobre o solo e alerta:
  - **TOO LOW GEAR** — abaixo de ~500 ft AGL com gear recolhido
  - **TOO LOW FLAPS** — abaixo de ~500 ft AGL sem flaps de aterragem

Aeronaves de gear fixo ignoram esses alertas.

---

## 12. Travões e Spoilers

### Travões (`B`)

- Apenas funcionais no solo.
- Use após touchdown para parar.
- Em descida com ground spoilers armados, ativam-se automaticamente ao tocar no solo.

### Spoilers (`\`)

- **Toggle** (`\`): estende/recolhe spoilers manualmente — reduz sustentação e adiciona arrasto.
- **Arm** (`Shift+\` ou toque longo no botão SPL mobile): armados, deploy automático ao tocar no solo.

---

## 13. Motores

### Pistão (Cessna 172)

- **Magneto** (`N`): cicla OFF → R → L → BOTH. Para arrancar, deve estar em BOTH.
- **Mixture** (`=`/`−`): ajusta razão ar/combustível. Em altitude, **empobreça** (mixture −) para evitar afogamento. Demasiado pobre = motor falha.

### Turbojets / Turbofans

- Sem mixture/magneto — usam throttle simples.
- **Spool-up lento**: o motor demora 5–10 s a responder a mudanças de throttle.
- **Afterburner** (se aplicável): empuxo > 100% consume combustível em alta taxa.

### Kill engines (`1`–`4`)

Simula falha individual de motor. Útil para treino de emergências em multi-motor.

---

## 14. GPWS e Stall Warning

| Alerta | Significado |
|--------|-------------|
| **STALL** (vermelho central) | Velocidade abaixo de Vs — perda iminente. Reduza pitch e adicione throttle. |
| **TOO LOW TERRAIN** | Aproximação rápida ao terreno fora de aproximação. Suba. |
| **TOO LOW GEAR** | Gear recolhido perto do solo. Estenda. |
| **TOO LOW FLAPS** | Sem flaps de aterragem perto do solo. Estenda. |
| **TERRAIN CLOSURE** | Taxa de aproximação ao terreno excessiva. Eleve o nariz. |
| **PULL UP** | Iminente crash com terreno — manobra de fuga obrigatória. |

---

## 15. Pause e Time Scale

- **Pause (`P`)** — congela física, mantém HUD visível.
- **Time scale** (`[` / `]`) — acelera/desacelera tempo de simulação. Útil em cruzeiros longos.
  - Valores: 0.25x, 0.5x, 1x, 2x, 4x, 8x, 16x, 32x
  - Aparece no topo do HUD quando ≠ 1.0x
  - A física continua estável até 8x; acima disso pode haver imprecisões em manobras agressivas

---

## 16. Missões

Acesse pelo botão **📋 Missions** ou via página *Missions* do site.

### Tipos

| Tipo | Descrição |
|------|-----------|
| **Free Flight** | Voo livre sem objetivo |
| **Scheduled** | Rota fixa entre dois aeroportos |
| **Challenge** | Cumprir requisitos (altitude, tempo, aeronave) |
| **Milestone** | Conquistas de carreira |

### Fluxo

1. Seleciona missão → **Start Mission** (status = Started).
2. Descole do aeroporto correto → status muda para **In Progress**.
3. Siga waypoints (visíveis no minimapa e painel NAV).
4. Aterre no destino:
   - **Correto** → Completed → recebe pontos de recompensa
   - **Errado** → Failed
5. Desconectar ou crashar → Failed (pode retentar)

### Auto-sequência de waypoints

Quando o avião passa a ~0.3 nm de um waypoint **ou** quando o ultrapassa pelo lado (abeam), o NAV avança automaticamente para o próximo waypoint.

---

## 17. Flight Plans

Use o botão **🗺 Flight Plans** para criar/carregar planos de voo personalizados:
- Departure / Arrival
- Cruise altitude
- Lista de waypoints intermediários

O AP em modo NAV segue automaticamente o flight plan ativo.

---

## 18. Multiplayer

Quando voa, a sua posição é partilhada em tempo real:
- Outros pilotos vê o seu avião 3D
- Você vê os outros como modelos coloridos no mundo e marcadores azuis no minimapa
- O contador **N ONLINE** no topo mostra pilotos próximos
- A latência (**WS time**) mede a qualidade da ligação

Privacidade: apenas posição, heading, velocidade e tipo de aeronave são partilhados — nunca dados pessoais.

---

## 19. ATC / Callouts

O copiloto/ATC virtual dá callouts de voz durante fases-chave:
- Pré-flight checklist
- Throttle up
- Rotate, V1, V2 (descolagem)
- Gear up, flaps retract
- Top of climb / cruise
- Top of descent
- Approach, final, flare
- Touchdown, brakes

Pode ser silenciado no menu de áudio.

---

## 20. Sistema de Falhas

Em modo avançado ou missões específicas, podem ocorrer falhas:

| Falha | Efeito |
|-------|--------|
| **Hydraulic** | Autoridade de controlos reduzida 30% — voar com cuidado |
| **Engine** | Motor individual apaga — compensar com trim de yaw em multi-motor |
| **Ice on surfaces** | Reduz sustentação, aumenta stall speed |

---

## 21. Crash e Respawn

Quando o avião colide com o terreno ou ultrapassa limites estruturais:
1. **CRASHED** aparece em vermelho ao centro.
2. Voo é registrado como `crashed` e missão (se ativa) falha.
3. Respawn automático em 3 segundos no aeroporto de partida.
4. Estado inicial: motor ralenti, flaps T/O, gear baixo, sem combustível perdido.

Manual: `R` para respawn imediato em qualquer momento.

---

## 22. Pilot Ranks

| Rank | Horas de Voo | Missões Cumpridas |
|------|--------------|-------------------|
| Student | 0 | 0 |
| Private Pilot | 10 | 2 |
| Commercial Pilot | 50 | 10 |
| Airline Pilot | 200 | 25 |
| Captain | 500 | 50 |
| Senior Captain | 1.000 | 100 |

**Ambas** as condições devem ser satisfeitas para promoção. Atualiza após cada aterragem bem-sucedida.

Algumas aeronaves requerem rank mínimo para serem desbloqueadas (ex.: `min_pilot_rank: 'commercial'`).

---

## 23. Pontos e Progressão

```
Total Points = Distance Points + Mission Points

Distance Points = floor(distância_km × 0.1)
Mission Points  = soma de reward_points das missões completadas
```

- 1 ponto por cada 10 km voados em **voos aterrados** (crash não conta).
- Pontos de missão só são atribuídos com status **completed**.

---

## 24. Free Flight Hour

Pode reivindicar **1 hora grátis** de voo a cada 7 dias — botão *Claim Free Hour* no dashboard. Útil para utilizadores não-premium.

---

## 25. Marketplace

Adquira aeronaves, aeroportos e licenças com pontos ou créditos:
- **Aeronaves** — adicionadas ao hangar (seleção via botão Aircraft no jogo)
- **Aeroportos** — registo de propriedade
- **Licenças** — desbloqueiam categorias específicas

---

## 26. Settings (Configurações)

Aceda em `Shift+D` ou pelo botão ⚙ no canto superior direito.

### Painéis disponíveis

- **Location** — saltar para coordenadas/aeroporto específico (busca por nome ou ICAO)
- **Graphics** — preset (Low/Medium/High/Ultra) + toggles individuais (Bloom, SSAO, Shadows, Fog, Vegetation, Color LUT, Volumetric Clouds)
- **Audio** — volumes Master/SFX/Music/ATC/Engine
- **Controls** — remapear teclas e configurar joystick mobile
- **Units** — Metric (km, °C) ou Imperial (nm, °F)
- **Accessibility** — filtros de daltonismo (Protanopia, Deuteranopia, Tritanopia)
- **Performance Auto-Detect** — benchmark de 5 s aplica preset adequado ao hardware

---

## 27. Cheat Sheet — Atalhos Essenciais

| Categoria | Tecla | Ação |
|-----------|-------|------|
| **Voo** | `W`/`S` | Throttle |
| | `↑`/`↓`/`←`/`→` | Pitch/Roll |
| | `Q`/`E` | Yaw |
| **Aterragem** | `G` | Trem |
| | `5`/`6` | Flaps |
| | `B` | Travões |
| | `\` | Spoilers |
| **Autopilot** | `Z` | AP master |
| | `F` `J` `K` | HDG/ALT/VS |
| | `U` `I` | NAV/APR |
| | `H` | Autothrottle |
| **Câmara** | `C` | Cicla |
| | `T` | Torre |
| | `Y` | Mouse yoke |
| **Sistema** | `P` | Pausa |
| | `[`/`]` | Time scale |
| | `M` | Easy mode |
| | `R` | Respawn |
| | `F12` | Screenshot |

---

## 28. Resolução de Problemas

| Problema | Solução |
|----------|---------|
| Performance baixa | Reduza preset gráfico para Low/Medium em ⚙ Settings |
| Controles touch não aparecem | Recarregue a página; o jogo deteta touch ao primeiro toque |
| Avião não aceita inputs | Verifique se autopilot está engajado (`Z` para desengatar) |
| `G` não recolhe trem | A aeronave tem gear fixo (ver tabela §3) |
| Combustível acaba muito rápido | Reduza throttle ou empobreça mixture (pistão) |
| GPS minimapa preto | Aguarde alguns segundos; tiles satelitais carregam assincronamente |
| AP gira para o lado errado | Verifique se o target HDG é o pretendido; AP sempre escolhe a rotação mais curta |
| Crash imediato no spawn | Aguarde a cinematica completar antes de mover stick |

---

## 29. Glossário

| Termo | Significado |
|-------|-------------|
| **AGL** | Above Ground Level (altitude sobre o solo) |
| **MSL** | Mean Sea Level (altitude sobre o nível do mar) |
| **IAS** | Indicated Air Speed |
| **TAS** | True Air Speed |
| **GS** | Ground Speed |
| **AOA** | Angle of Attack |
| **VS** | Vertical Speed (taxa de subida/descida) |
| **HDG** | Heading (rumo magnético) |
| **NAV** | Navigation mode (segue waypoints) |
| **APR** | Approach mode (ILS) |
| **AP** | Autopilot |
| **AT** | Autothrottle |
| **XTE** | Cross-Track Error (desvio lateral da rota) |
| **ETE** | Estimated Time En-route |
| **ETA** | Estimated Time of Arrival |
| **BRG** | Bearing (rumo até ao ponto) |
| **VNE** | Velocity Never Exceed (velocidade máxima estrutural) |
| **VFE** | Flap Extended Speed (velocidade máxima com flaps) |
| **VS₀** | Stall speed (perda) |
| **TOGA** | Take-Off / Go-Around (throttle máximo) |
| **GPWS** | Ground Proximity Warning System |
| **ILS** | Instrument Landing System (LOC + GS) |
| **LOC** | Localizer (guia lateral) |
| **GS** (ILS) | Glide Slope (guia vertical) |
| **PFD** | Primary Flight Display |
| **HUD** | Heads-Up Display |

---

Bons voos! ✈️
