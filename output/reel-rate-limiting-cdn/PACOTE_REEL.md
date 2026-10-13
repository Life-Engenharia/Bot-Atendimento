# Reel — Rate Limiting + CDN

Formato: 9:16, 1080 × 1920, cerca de 42 segundos.  
Direção: fundo quase preto, título branco condensado em caixa alta, laranja para risco/sobrecarga e azul para proteção/distribuição. Não há pessoas, rostos ou personagens.

## Regra de ouro

No Google Flow, envie **uma imagem por vez** e use apenas o prompt indicado para a cena. Não peça que a ferramenta escreva textos no vídeo. Os títulos, a voz e as legendas entram no CapCut depois.

Use movimento contido: o objetivo é parecer um carrossel editorial que ganhou vida, não uma cena de filme de ficção científica.

## Cenas

| # | Arquivo | Duração | Texto na tela (CapCut) | Voz IA (CapCut) |
|---|---|---:|---|---|
| 1 | `01-hook-origem-sobrecarga.png` | 0–6 s | `10.000 REQUISIÇÕES.\n1 SERVIDOR.` | "Dez mil requisições chegam ao mesmo tempo. O que acontece com o seu servidor?" |
| 2 | `02-sem-rate-limiting.png` | 6–13 s | `SEM RATE LIMITING,\nA API ACEITA TUDO.` | "Sem Rate Limiting, a API aceita chamadas repetidas até consumir os recursos disponíveis." |
| 3 | `03-rate-limiting-filtro.png` | 13–20 s | `RATE LIMITING\nCONTROLA O ABUSO.` | "Rate Limiting define quanto cada origem pode pedir em um período. O excesso é desacelerado ou bloqueado." |
| 4 | `04-sem-cdn.png` | 20–27 s | `SEM CDN,\nTUDO CHEGA À ORIGEM.` | "E sem uma CDN, imagens, arquivos e acessos de cada região vão direto para o mesmo servidor de origem." |
| 5 | `05-cdn-na-borda.png` | 27–34 s | `A CDN ENTREGA\nPERTO DE QUEM ACESSA.` | "A CDN distribui conteúdo em pontos próximos do usuário. Assim, a origem recebe muito menos carga." |
| 6 | `06-arquitetura-protegida.png` | 34–42 s | `CDN DISTRIBUI.\nRATE LIMITING CONTROLA.` | "Os dois se complementam: a CDN reduz a carga, e o Rate Limiting controla o abuso. Proteja a origem antes de escalar." |

## Prompts para Google Flow

### Configuração em todas as cenas

- Formato: **9:16**.
- Duração: **6 segundos**; se o modelo permitir apenas 8, gere 8 e corte para os tempos acima.
- Desative diálogo/fala. Mantenha apenas som ambiente tecnológico discreto, ou silencie o clipe no CapCut.
- Não adicione pessoas, personagens, logos, texto legível, letras, números ou novas telas de interface.
- Preserve a composição vertical e a área escura livre no alto/esquerda para a tipografia.

### 1. Sobrecarga

```text
Animate this exact reference image. Keep its editorial cyber-security composition unchanged. A dense red-orange flow of abstract data packets accelerates diagonally toward the server; the server LEDs pulse faster and a very subtle camera push-in increases urgency. Keep the left-side dark negative space clean. No people, no readable text, no labels, no dialogue, no new objects, no camera shake. Cinematic but restrained 6-second vertical 9:16 clip.
```

### 2. Sem Rate Limiting

```text
Animate this exact reference image. The incoming data packets increase gradually in density and speed, the orange charts and gateway lights intensify, and the gateway reaches visual overload without exploding. Use a slow forward camera movement. Preserve the upper-left dark negative space. No people, no readable text, no labels, no dialogue, no new UI elements. Premium restrained cyber-security editorial animation, 6 seconds, vertical 9:16.
```

### 3. Filtro de Rate Limiting

```text
Animate this exact reference image. Orange packets approach the amber gateway grid; most are smoothly diverted and fade outside the grid, while a small, orderly blue-white stream passes through to the server. The transition should communicate controlled filtering, not destruction. Slow camera push-in, preserve the upper-left empty dark space. No people, no readable text, no labels, no dialogue, no new objects. Controlled 6-second vertical 9:16 technical editorial animation.
```

### 4. Sem CDN

```text
Animate this exact reference image. The different asset tiles and data particles from several directions converge continuously on the single origin server. The origin lights warm up and pulse under load while the camera slowly moves closer. Keep the dark top-left space untouched for later typography. No people, no readable text, no labels, no dialogue, no new objects, no destruction. Cinematic 6-second vertical 9:16 cybersecurity editorial animation.
```

### 5. CDN na borda

```text
Animate this exact reference image. Bright blue signals travel smoothly from nearby edge nodes to local endpoints around the globe. The protected origin in the lower-right receives only one thin calm stream. Use subtle orbital camera drift and slow light pulses in the edge nodes. Preserve the clean dark upper-left area. No people, no readable text, no labels, no dialogue, no new objects. Calm, resilient 6-second vertical 9:16 technical editorial animation.
```

### 6. Arquitetura protegida

```text
Animate this exact reference image. Blue traffic flows calmly through the distributed edge network toward the protected origin. Orange packets approach from the left and are gently diverted before reaching the origin. The final second should settle into a quiet, stable architecture. Slow cinematic camera push-in; keep the upper-left dark negative space clean. No people, no readable text, no labels, no dialogue, no new objects. Premium 6-second vertical 9:16 cybersecurity editorial animation.
```

## Montagem no CapCut

1. Crie o projeto em 1080 × 1920, 30 fps.
2. Coloque os seis clipes na ordem da tabela, sem transição ou com dissolve muito curto (0,15 s).
3. Use uma fonte condensada pesada semelhante a **Anton**, **Bebas Neue** ou à tipografia dos seus carrosséis. Títulos em branco/off-white, caixa alta, alinhados à esquerda.
4. Aplique sublinhado/traço fino laranja nas cenas 1–4 e azul nas cenas 5–6. Mantenha os títulos fora das áreas centrais da imagem.
5. Adicione a voz IA com ritmo calmo, confiante e didático; uma voz brasileira neutra funciona melhor. Velocidade sugerida: 0,96x–1,00x.
6. Gere legendas automáticas e revise os termos: `Rate Limiting`, `CDN`, `API` e `origem`.
7. Trilha: eletrônica minimalista, sem voz, volume entre 8% e 12%. Voz entre 90% e 100%.
8. No último segundo, inclua um CTA pequeno: `SALVE PARA REVISAR SUA ARQUITETURA`.

## Legenda do post

> CDN e Rate Limiting resolvem problemas diferentes — e os dois importam.
>
> A CDN entrega conteúdo perto de quem acessa e reduz a pressão sobre a origem. O Rate Limiting define limites para que requisições repetidas não consumam seus recursos.
>
> Um distribui carga. O outro controla abuso. Nenhum substitui o outro.
>
> Salve para revisar sua arquitetura antes de precisar escalar.  
> #Cibersegurança #SegurançaDaInformação #DevSecOps #APIs #CDN #RateLimiting #Backend

## Checklist técnico antes de publicar

- Confirme que cada clipe está em 9:16 e não perdeu a área livre dos títulos.
- Não explique métodos de ataque ou instruções operacionais; mantenha o foco na defesa e no impacto.
- Confira se a voz pronuncia "Rate Limiting" de modo natural. Se necessário, escreva na voz IA: "reiti limíting" e mantenha o termo correto apenas no texto da tela.
