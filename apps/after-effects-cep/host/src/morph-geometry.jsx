/** Exact cubic geometry for the word morph. All expensive correspondence work runs at creation. */
(function (global) {
  /** @param {any} p @param {any} q @param {number} t @returns {any} */
  function mmLerp(p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; }
  /** @param {any} c @param {number} t @returns {any} */
  function mmSplit(c, t) {
    var a = mmLerp(c[0], c[1], t), b = mmLerp(c[1], c[2], t), d = mmLerp(c[2], c[3], t);
    var e = mmLerp(a, b, t), f = mmLerp(b, d, t), p = mmLerp(e, f, t);
    return {left: [c[0], a, e, p], right: [p, f, d, c[3]]};
  }
  /** @param {any} c @param {number} lo @param {number} hi @returns {any} */
  function mmSub(c, lo, hi) {
    if (lo <= 0 && hi >= 1) return c;
    var part = hi < 1 ? mmSplit(c, hi).left : c;
    return lo > 0 ? mmSplit(part, lo / hi).right : part;
  }
  /** @param {any} c @param {number} t @returns {any} */
  function at(c, t) { return mmSplit(c, t).left[3]; }
  /** @param {any} p @returns {any} */
  function normalize(p) {
    if (!p || p.closed !== true || !p.vertices || p.vertices.length < 2 || p.vertices.length > 4096) throw new Error('Morph requires a bounded closed contour');
    var s = {vertices: /** @type {any[]} */ ([]), inTangents: /** @type {any[]} */ ([]), outTangents: /** @type {any[]} */ ([]), closed: true};
    for (var i = 0; i < p.vertices.length; i++) {
      var v = p.vertices[i], a = p.inTangents && p.inTangents[i], b = p.outTangents && p.outTangents[i];
      if (!v || !a || !b || v.length !== 2 || a.length !== 2 || b.length !== 2) throw new Error('Invalid morph contour dimensions');
      for (var j = 0; j < 2; j++) if (typeof v[j] !== 'number' || !isFinite(v[j]) || typeof a[j] !== 'number' || !isFinite(a[j]) || typeof b[j] !== 'number' || !isFinite(b[j])) throw new Error('Non-finite morph contour');
      s.vertices.push([v[0], v[1]]); s.inTangents.push([a[0], a[1]]); s.outTangents.push([b[0], b[1]]);
    }
    return s;
  }
  /** @param {any} p @returns {any[]} */
  function curves(p) {
    var result = [];
    for (var i = 0; i < p.vertices.length; i++) {
      var next = (i + 1) % p.vertices.length, a = p.vertices[i], b = p.vertices[next];
      result.push([a, [a[0] + p.outTangents[i][0], a[1] + p.outTangents[i][1]], [b[0] + p.inTangents[next][0], b[1] + p.inTangents[next][1]], b]);
    }
    return result;
  }
  /** @param {any[]} cs @returns {any} */
  function mmShape(cs) {
    var s = {vertices: /** @type {any[]} */ ([]), inTangents: /** @type {any[]} */ ([]), outTangents: /** @type {any[]} */ ([]), closed: true};
    for (var i = 0; i < cs.length; i++) {
      var c = cs[i], prev = cs[(i + cs.length - 1) % cs.length];
      s.vertices.push([c[0][0], c[0][1]]);
      s.outTangents.push([c[1][0] - c[0][0], c[1][1] - c[0][1]]);
      s.inTangents.push([prev[2][0] - prev[3][0], prev[2][1] - prev[3][1]]);
    }
    return s;
  }
  /** @param {any} p @returns {any} */
  function bounds(p) {
    var cs = curves(normalize(p)), lo = /** @type {[number, number]} */ ([Infinity, Infinity]), hi = /** @type {[number, number]} */ ([-Infinity, -Infinity]);
    for (var i = 0; i < cs.length; i++) for (var axis = 0; axis < 2; axis++) {
      var c = cs[i], a = -c[0][axis] + 3 * c[1][axis] - 3 * c[2][axis] + c[3][axis];
      var b = 2 * (c[0][axis] - 2 * c[1][axis] + c[2][axis]), d = c[1][axis] - c[0][axis];
      var ts = /** @type {any[]} */ ([0, 1]), disc = b * b - 4 * a * d;
      if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) ts.push(-d / b); }
      else if (disc >= 0) { ts.push((-b + Math.sqrt(disc)) / (2 * a)); ts.push((-b - Math.sqrt(disc)) / (2 * a)); }
      for (var j = 0; j < ts.length; j++) if (ts[j] >= 0 && ts[j] <= 1) { var v = at(c, ts[j])[axis]; lo[axis] = Math.min(Number(lo[axis]), v); hi[axis] = Math.max(Number(hi[axis]), v); }
    }
    return {left: lo[0], top: lo[1], right: hi[0], bottom: hi[1], width: hi[0] - lo[0], height: hi[1] - lo[1]};
  }
  /** @param {any} c @param {number} axis @returns {[number, number, number, number]} */
  function polynomial(c, axis) { return [c[0][axis], 3 * (c[1][axis] - c[0][axis]), 3 * (c[0][axis] - 2 * c[1][axis] + c[2][axis]), -c[0][axis] + 3 * c[1][axis] - 3 * c[2][axis] + c[3][axis]]; }
  /** @param {any} p @returns {number} */
  function area(p) {
    var cs = curves(normalize(p)), total = 0;
    for (var i = 0; i < cs.length; i++) {
      var x = /** @type {any} */ (polynomial(cs[i], 0)), y = /** @type {any} */ (polynomial(cs[i], 1));
      for (var j = 0; j < 4; j++) for (var k = 1; k < 4; k++) total += (x[j] * k * y[k] - y[j] * k * x[k]) / (j + k);
    }
    return total / 2;
  }
  /** @param {any} p @param {any} m @returns {any} */
  function transform(p, m) {
    var s = normalize(p);
    if (!m || m.length !== 6 || Math.abs(m[0] * m[3] - m[1] * m[2]) < 1e-12) throw new Error('Singular morph transform');
    for (var j = 0; j < 6; j++) if (typeof m[j] !== 'number' || !isFinite(m[j])) throw new Error('Invalid morph transform');
    for (var i = 0; i < s.vertices.length; i++) {
      var v = s.vertices[i], a = s.inTangents[i], b = s.outTangents[i];
      s.vertices[i] = [m[0] * v[0] + m[2] * v[1] + m[4], m[1] * v[0] + m[3] * v[1] + m[5]];
      s.inTangents[i] = [m[0] * a[0] + m[2] * a[1], m[1] * a[0] + m[3] * a[1]];
      s.outTangents[i] = [m[0] * b[0] + m[2] * b[1], m[1] * b[0] + m[3] * b[1]];
    }
    return s;
  }
  /** @param {any} p @param {number} start @param {boolean} reverse @returns {any} */
  function reorder(p, start, reverse) {
    var s = {vertices: /** @type {any[]} */ ([]), inTangents: /** @type {any[]} */ ([]), outTangents: /** @type {any[]} */ ([]), closed: true}, n = p.vertices.length;
    for (var i = 0; i < n; i++) {
      var k = (start + (reverse ? -i : i) + n) % n;
      s.vertices.push(p.vertices[k]); s.inTangents.push(reverse ? p.outTangents[k] : p.inTangents[k]); s.outTangents.push(reverse ? p.inTangents[k] : p.outTangents[k]);
    }
    return s;
  }
  /** @param {any} p @param {any} point @returns {boolean} */
  function contains(p, point) {
    var cs = curves(p), polygon = [], inside = false;
    for (var i = 0; i < cs.length; i++) for (var j = 0; j < 16; j++) polygon.push(at(cs[i], j / 16));
    for (i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      var a = polygon[i], b = polygon[j];
      if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    }
    return inside;
  }
  /** Eight stable segments keep rounded corners adjustable without rebuilding correspondence.
   * @param {any} c @param {number} radius @returns {any[]} */
  function mmRect(c, radius) {
    var x = c.x, y = c.y, w = Math.max(0.000001, c.width), h = Math.max(0.000001, c.height);
    var limit = Math.min(typeof c.maxRadius === 'number' ? c.maxRadius : w, c.first && c.last ? w / 2 : w);
    var r = Math.max(0, Math.min(radius, h / 2, limit)), k = 0.5522847498307936;
    var tl = c.first ? r : 0, bl = tl, tr = c.last ? r : 0, br = tr;
    var p = /** @type {any[]} */ ([[x + tl,y],[x + w - tr,y],[x + w,y + tr],[x + w,y + h - br],[x + w - br,y + h],[x + bl,y + h],[x,y + h - bl],[x,y + tl]]);
    var out = /** @type {any[]} */ ([[0,0],[tr*k,0],[0,0],[0,br*k],[0,0],[-bl*k,0],[0,0],[0,-tl*k]]);
    var ins = /** @type {any[]} */ ([[-tl*k,0],[0,0],[0,-tr*k],[0,0],[br*k,0],[0,0],[0,bl*k],[0,0]]), cs = [];
    for (var i=0;i<8;i++) { var j=(i+1)%8; cs.push([p[i],[p[i][0]+out[i][0],p[i][1]+out[i][1]],[p[j][0]+ins[j][0],p[j][1]+ins[j][1]],p[j]]); }
    return cs;
  }
  /** @param {any[]} cs @returns {number[]} */
  function breaks(cs) {
    var weights = /** @type {any[]} */ ([]), total = 0, result = [0];
    for (var i=0;i<cs.length;i++) {
      var length=0, last=cs[i][0];
      for (var j=1;j<=12;j++) { var next=at(cs[i],j/12), dx=next[0]-last[0],dy=next[1]-last[1]; length+=Math.sqrt(dx*dx+dy*dy);last=next; }
      length=Math.max(0.000001,length);weights.push(length);total+=length;
    }
    var accum=0; for(i=0;i<weights.length;i++) {accum+=weights[i];result.push(accum/total);} result[result.length-1]=1;
    return result;
  }
  /** @param {any} bs @param {number} lo @param {number} hi @returns {[number, number, number]} */
  function interval(bs,lo,hi) {
    var mid=(lo+hi)/2, segment=0;
    while(segment<bs.length-2 && bs[segment+1]<mid) segment++;
    var span=bs[segment+1]-bs[segment];
    return [segment,Math.max(0,Math.min(1,(lo-bs[segment])/span)),Math.max(0,Math.min(1,(hi-bs[segment])/span))];
  }
  /** @param {any[]} cs @param {any} bs @param {number} u @returns {any} */
  function sample(cs,bs,u) { var part=interval(bs,u,Math.min(1,u+1e-12));return at(cs[part[0]],part[1]); }
  /** @param {any} p @param {any} cell @param {number} radius @returns {any} */
  function aligned(p,cell,radius) {
    var b=bounds(p), best=0, score=Infinity, sc=mmRect(cell,radius), sb=[];
    for(var k=0;k<=8;k++)sb.push(k/8);
    // Compare the complete cyclic correspondence; a top-left anchor alone twists concave glyphs such as U.
    var step=Math.max(1,Math.floor(p.vertices.length/128));
    for(var i=0;i<p.vertices.length;i+=step) {
      var candidate=reorder(p,i,false),tc=curves(candidate),tb=breaks(tc),cost=0;
      for(var j=0;j<48;j++) {
        var u=j/48,s=sample(sc,sb,u),t=sample(tc,tb,u);
        var dx=(s[0]-cell.x)/cell.width-(t[0]-b.left)/Math.max(0.000001,b.width),dy=(s[1]-cell.y)/cell.height-(t[1]-b.top)/Math.max(0.000001,b.height);
        cost+=dx*dx+dy*dy;
      }
      if(cost<score){score=cost;best=i;}
    }
    return reorder(p,best,false);
  }
  /** @param {any[]} contours @param {any} cell @param {any} [opts] @returns {any[]} */
  function prepareGlyph(contours,cell,opts) {
    if(!contours || !contours.length || contours.length>128) throw new Error('Invalid glyph contours');
    if(opts && typeof opts.roundness === 'number' && !isFinite(opts.roundness)) throw new Error('Invalid morph roundness');
    var paths=[], principal=0, largest=0, totalBounds=null;
    for(var i=0;i<contours.length;i++) {
      var p=normalize(contours[i]), a=Math.abs(area(p)), b=bounds(p); paths.push(p);
      if(a>largest){largest=a;principal=i;}
      if(!totalBounds) totalBounds=b; else {totalBounds.left=Math.min(totalBounds.left,b.left);totalBounds.top=Math.min(totalBounds.top,b.top);totalBounds.right=Math.max(totalBounds.right,b.right);totalBounds.bottom=Math.max(totalBounds.bottom,b.bottom);}
    }
    if(largest<0.00000001 || !totalBounds) throw new Error('Glyph has no finite filled area');
    if(!cell || !isFinite(cell.x) || !isFinite(cell.y) || !isFinite(cell.width) || !isFinite(cell.height) || cell.width<=0 || cell.height<=0) throw new Error('Invalid morph cell');
    var sb=[];
    // Fixed slots include zero-radius corner segments, so increasing roundness remains live.
    for(i=0;i<=8;i++) sb.push(i/8);
    var data=[];
    for(i=0;i<paths.length;i++) {
      var depth=0;
      for(var j=0;j<paths.length;j++) if(i!==j && Math.abs(area(paths[j]))>Math.abs(area(paths[i])) && contains(paths[j],paths[i].vertices[0])) depth++;
      var reverse=(area(paths[i])>0)!==(depth%2===0), oriented=reorder(paths[i],0,reverse);
      var alignedTarget=i===principal?aligned(oriented,cell,opts&&opts.roundness?opts.roundness:0):oriented;
      var tc=curves(alignedTarget), tb=breaks(tc), combined=/** @type {any[]} */ (tb.concat(sb));combined.sort(function(a,b){return a-b;});
      var union=/** @type {any[]} */ ([0]);for(j=1;j<combined.length;j++)if(combined[j]-union[union.length-1]>1e-10)union.push(combined[j]);union[union.length-1]=1;
      var matched=[], map=[];
      for(j=0;j<union.length-1;j++) {var ti=interval(tb,union[j],union[j+1]);matched.push(mmSub(tc[ti[0]],ti[1],ti[2]));map.push(interval(sb,union[j],union[j+1]));}
      var pb=bounds(alignedTarget), nx=((pb.left+pb.right)/2-totalBounds.left)/Math.max(0.000001,totalBounds.right-totalBounds.left),ny=((pb.top+pb.bottom)/2-totalBounds.top)/Math.max(0.000001,totalBounds.bottom-totalBounds.top);
      data.push({target:mmShape(matched),sourceMap:map,extra:i!==principal,collapse:[nx,ny],depth:depth});
    }
    return data;
  }
  /** @param {any} data @param {any} cell @param {number} radius @returns {any} */
  function source(data,cell,radius) {
    var cs=mmRect(cell,radius), parts=[];
    for(var i=0;i<data.sourceMap.length;i++) {
      var map=data.sourceMap[i];
      if(data.extra) {var p=[cell.x+cell.width*data.collapse[0],cell.y+cell.height*data.collapse[1]];parts.push([p,p,p,p]);}
      else parts.push(mmSub(cs[map[0]],map[1],map[2]));
    }
    return mmShape(parts);
  }
  /** @param {any} data @param {string} cellExpression @param {string} radiusExpression @returns {string} */
  function sourceExpression(data,cellExpression,radiusExpression) {
    var serialized=MotionJson.stringify({sourceMap:data.sourceMap,extra:data.extra,collapse:data.collapse});
    var helpers=functionSource(mmLerp)+'\n'+functionSource(mmSplit)+'\n'+functionSource(mmSub)+'\n'+functionSource(mmShape)+'\n'+functionSource(mmRect)+'\n'+functionSource(source);
    return helpers+'\nvar S=source('+serialized+','+cellExpression+','+radiusExpression+');var sv=S.vertices,si=S.inTangents,so=S.outTangents;\n';
  }
  /** ExtendScript's Function.toString includes a trailing, unterminated comment from the next declaration.
   * Extract the balanced function body before handing the helpers to the JavaScript expression engine.
   * @param {Function} fn @returns {string} */
  function functionSource(fn) {
    var s=fn.toString().replace(/\r\n?/g,'\n'),start=s.indexOf('{'),depth=0,quote='',block=false,line=false;
    for(var i=start;i<s.length;i++) {
      var c=s.charAt(i),next=s.charAt(i+1);
      if(block){if(c==='*'&&next==='/'){block=false;i++;}continue;}
      if(line){if(c==='\n')line=false;continue;}
      if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote='';continue;}
      if(c==='/'&&next==='*'){block=true;i++;continue;}if(c==='/'&&next==='/'){line=true;i++;continue;}
      if(c==='"'||c==="'"){quote=c;continue;}
      if(c==='{')depth++;else if(c==='}') {depth--;if(depth===0)return s.substring(0,i+1).replace(/\/\*[\s\S]*?\*\//g,'');}
    }
    throw new Error('Invalid expression geometry helper');
  }
  /** @param {number} u @param {number} smoothness @returns {number} */
  function ease(u,smoothness) {if(u<=0)return 0;if(u>=1)return 1;var a=1+3*Math.max(0,Math.min(100,smoothness))/100,x=Math.pow(u,a),y=Math.pow(1-u,a);return x/(x+y);}
  global.MotionMorphGeometry={normalize:normalize,bounds:bounds,area:area,transform:transform,splitCubic:mmSplit,subCurve:mmSub,curves:curves,prepareGlyph:prepareGlyph,source:source,sourceExpression:sourceExpression,ease:ease};
}($.global));
