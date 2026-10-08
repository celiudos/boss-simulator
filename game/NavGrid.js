// Grade de navegacao para quem anda sozinho pelo campo.
// Modulo puro (sem Phaser): recebe os retangulos de colisao (se houver) e a area onde da para andar
// e acha caminhos com A* (8 direcoes), depois "alisa" o caminho com linha de visada para a caminhada
// sair natural (menos zigue-zague). As coordenadas sao dos PES do personagem (onde fica o corpo
// fisico), nao do centro do sprite: use `feetOffsetY` para converter.

const SQRT2 = Math.SQRT2;

export class NavGrid {
  /**
   * @param {object} opts
   * @param {{x:number,y:number,width:number,height:number}[]} opts.rects  colisoes (px do mundo)
   * @param {{x:number,y:number,width:number,height:number}} opts.bounds    area onde da para andar
   * @param {number} [opts.cell=24]   lado da celula (px)
   * @param {{width:number,height:number}} [opts.body]  corpo nos pes (px)
   * @param {number} [opts.margin=2]  folga extra em volta do corpo (px)
   */
  constructor({ rects, bounds, cell = 24, body = { width: 24, height: 19 }, margin = 2 }) {
    this.rects = rects.filter((r) => r.width > 0 && r.height > 0);
    this.bounds = bounds;
    this.cell = cell;
    this.halfW = body.width / 2 + margin;
    this.halfH = body.height / 2 + margin;
    this.cols = Math.max(1, Math.floor(bounds.width / cell));
    this.rows = Math.max(1, Math.floor(bounds.height / cell));
    this.walkable = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const { x, y } = this.center(c, r);
        this.walkable[r * this.cols + c] = this.isFree(x, y) ? 1 : 0;
      }
    }
    this.keepLargestRegion();
  }

  /**
   * Deixa so a maior regiao conectada: bolsoes isolados (ex.: vao do lado de fora de uma parede)
   * nunca seriam alcancados e fariam o sorteio de destinos falhar.
   */
  keepLargestRegion() {
    const { cols, rows, walkable } = this;
    const region = new Int32Array(cols * rows).fill(-1);
    const sizes = [];
    for (let start = 0; start < walkable.length; start++) {
      if (!walkable[start] || region[start] !== -1) continue;
      const id = sizes.length;
      let size = 0;
      const stack = [start];
      region[start] = id;
      while (stack.length) {
        const i = stack.pop();
        size++;
        const c = i % cols;
        const r = (i - c) / cols;
        for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
          const ni = nr * cols + nc;
          if (this.inGrid(nc, nr) && walkable[ni] && region[ni] === -1) {
            region[ni] = id;
            stack.push(ni);
          }
        }
      }
      sizes.push(size);
    }
    if (sizes.length <= 1) return;
    const main = sizes.indexOf(Math.max(...sizes));
    for (let i = 0; i < walkable.length; i++) if (region[i] !== main) walkable[i] = 0;
  }

  /** Centro da celula (c, r) em px. */
  center(c, r) {
    return { x: this.bounds.x + (c + 0.5) * this.cell, y: this.bounds.y + (r + 0.5) * this.cell };
  }

  /** Celula que contem o ponto (pode estar fora da grade). */
  cellOf(x, y) {
    return { c: Math.floor((x - this.bounds.x) / this.cell), r: Math.floor((y - this.bounds.y) / this.cell) };
  }

  inGrid(c, r) {
    return c >= 0 && r >= 0 && c < this.cols && r < this.rows;
  }

  isWalkableCell(c, r) {
    return this.inGrid(c, r) && this.walkable[r * this.cols + c] === 1;
  }

  /** O corpo, com os pes em (x, y), cabe ali sem encostar em nada e dentro da area? */
  isFree(x, y) {
    const { bounds: b, halfW, halfH } = this;
    if (x - halfW < b.x || x + halfW > b.x + b.width || y - halfH < b.y || y + halfH > b.y + b.height) return false;
    for (const o of this.rects) {
      if (x + halfW > o.x && x - halfW < o.x + o.width && y + halfH > o.y && y - halfH < o.y + o.height) return false;
    }
    return true;
  }

  /** Da para andar em linha reta de a ate b (amostrando o corpo a cada `step` px)? */
  lineFree(a, b, step = 6) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      if (!this.isFree(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)) return false;
    }
    return true;
  }

  /** Celula livre mais proxima do ponto (busca em aneis); null se a grade nao tiver nenhuma. */
  nearestWalkable(x, y, maxRing = Math.max(this.cols, this.rows)) {
    const { c: c0, r: r0 } = this.cellOf(x, y);
    let best = null;
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let dr = -ring; dr <= ring; dr++) {
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (!this.isWalkableCell(c, r)) continue;
          const p = this.center(c, r);
          const d = Math.hypot(p.x - x, p.y - y);
          if (!best || d < best.d) best = { ...p, c, r, d };
        }
      }
      if (best) return { x: best.x, y: best.y, c: best.c, r: best.r };
    }
    return null;
  }

  /** Celula livre aleatoria a ate `radius` px de (x, y). `rng` = Math.random por padrao. */
  randomWalkable(x, y, radius, rng = Math.random, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * radius;
      const { c, r } = this.cellOf(x + Math.cos(a) * d, y + Math.sin(a) * d);
      if (this.isWalkableCell(c, r)) return this.center(c, r);
    }
    return this.nearestWalkable(x, y);
  }

  /**
   * Celula livre aleatoria dentro do retangulo `rect` (o centro da celula fica dentro dele): serve
   * para confinar quem passeia a uma area. Sem nenhuma celula livre ali, devolve a mais proxima
   * do centro do retangulo (ou null se a grade nao tiver nenhuma).
   */
  randomWalkableIn(rect, rng = Math.random, tries = 40) {
    for (let i = 0; i < tries; i++) {
      const { c, r } = this.cellOf(rect.x + rng() * rect.width, rect.y + rng() * rect.height);
      if (!this.isWalkableCell(c, r)) continue;
      const p = this.center(c, r);
      if (p.x >= rect.x && p.x <= rect.x + rect.width && p.y >= rect.y && p.y <= rect.y + rect.height) return p;
    }
    return this.nearestWalkable(rect.x + rect.width / 2, rect.y + rect.height / 2);
  }

  /**
   * Caminho de `from` ate `to` (px). Retorna a lista de pontos a percorrer (sem o ponto de
   * partida, terminando exatamente em `to` se ele for livre) ou null se nao houver caminho.
   */
  findPath(from, to) {
    const fromCell = this.cellOf(from.x, from.y);
    const start = this.isWalkableCell(fromCell.c, fromCell.r) ? fromCell : this.nearestWalkable(from.x, from.y);
    const goalFree = this.isFree(to.x, to.y);
    const goalCell = this.cellOf(to.x, to.y);
    const goal = this.isWalkableCell(goalCell.c, goalCell.r) ? goalCell : this.nearestWalkable(to.x, to.y);
    if (!start || !goal) return null;

    const cells = this.astar(start, goal);
    if (!cells) return null;
    const points = cells.map(({ c, r }) => this.center(c, r));
    // Ponto exato de chegada (se for livre e der para chegar em linha reta da ultima celula).
    const end = goalFree && this.lineFree(points.at(-1), to) ? { x: to.x, y: to.y } : points.at(-1);
    points[points.length - 1] = end;
    return this.smooth([{ x: from.x, y: from.y }, ...points]).slice(1);
  }

  /** A* classico na grade, 8 vizinhos (diagonal so se as duas laterais estiverem livres). */
  astar(start, goal) {
    const { cols } = this;
    const idx = (c, r) => r * cols + c;
    const startI = idx(start.c, start.r);
    const goalI = idx(goal.c, goal.r);
    if (startI === goalI) return [{ c: goal.c, r: goal.r }];

    const g = new Float64Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const h = (c, r) => {
      const dx = Math.abs(c - goal.c);
      const dy = Math.abs(r - goal.r);
      return dx + dy + (SQRT2 - 2) * Math.min(dx, dy);
    };
    // Fila de prioridade simples (heap binario) com [f, indice].
    const heap = [];
    const push = (f, i) => {
      heap.push([f, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = 2 * k + 1;
          const r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };

    g[startI] = 0;
    push(h(start.c, start.r), startI);
    while (heap.length) {
      const [, i] = pop();
      if (closed[i]) continue;
      if (i === goalI) break;
      closed[i] = 1;
      const c = i % cols;
      const r = (i - c) / cols;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const nc = c + dc;
          const nr = r + dr;
          if (!this.isWalkableCell(nc, nr)) continue;
          if (dc && dr && (!this.isWalkableCell(c + dc, r) || !this.isWalkableCell(c, r + dr))) continue;
          const ni = idx(nc, nr);
          if (closed[ni]) continue;
          const ng = g[i] + (dc && dr ? SQRT2 : 1);
          if (ng < g[ni]) {
            g[ni] = ng;
            came[ni] = i;
            push(ng + h(nc, nr), ni);
          }
        }
      }
    }
    if (came[goalI] === -1) return null;
    const path = [];
    for (let i = goalI; i !== -1; i = came[i]) {
      const c = i % cols;
      path.push({ c, r: (i - c) / cols });
      if (i === startI) break;
    }
    return path.reverse();
  }

  /** Remove pontos intermediarios quando da para ir direto (linha de visada). */
  smooth(points) {
    if (points.length <= 2) return points;
    const out = [points[0]];
    let i = 0;
    while (i < points.length - 1) {
      let j = points.length - 1;
      while (j > i + 1 && !this.lineFree(points[i], points[j])) j--;
      out.push(points[j]);
      i = j;
    }
    return out;
  }
}
