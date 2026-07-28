/* =====================================================================
   FL-UI — Interactions partagées FL-System (vanilla, sans dépendance)
   À charger sur TOUTES les pages : balise script src="/fl-ui/fl-ui.js" defer (en fin de body)
   S'auto-initialise. Respecte prefers-reduced-motion et les écrans tactiles.
   Data-attributs à poser dans le HTML :
     [data-fl-magnetic="18"]   → bouton/élément magnétique (force en px)
     [data-fl-tilt]            → carte en tilt 3D + reflet (mettre un .fl-card__gloss dedans)
     .fl-decode[data-text="…"] → texte qui se décode
     .fl-reveal                → apparition au scroll
     [data-fl-count][data-to][data-dec][data-suf] → compteur animé
     <canvas class="fl-gl" data-fl-shader></canvas> → fond WebGL (pages hero seulement)
   ===================================================================== */
(function(){
  "use strict";
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COARSE = matchMedia('(pointer: coarse)').matches;
  var $ = function(s,c){return Array.prototype.slice.call((c||document).querySelectorAll(s));};

  /* ---------- curseur custom ---------- */
  function initCursor(){
    if(RM||COARSE) return;
    var dot=document.createElement('div'), ring=document.createElement('div');
    dot.className='fl-cursor-dot'; ring.className='fl-cursor-ring';
    document.body.appendChild(dot); document.body.appendChild(ring);
    document.documentElement.classList.add('fl-cursor-on');
    var mx=innerWidth/2,my=innerHeight/2,rx=mx,ry=my;
    addEventListener('mousemove',function(e){mx=e.clientX;my=e.clientY;dot.style.left=mx+'px';dot.style.top=my+'px';
      if(window.__flShader) window.__flShader.mouse(e.clientX,e.clientY);});
    (function loop(){rx+=(mx-rx)*.18;ry+=(my-ry)*.18;ring.style.left=rx+'px';ring.style.top=ry+'px';requestAnimationFrame(loop);})();
    $('a,button,input,textarea,select,[data-fl-magnetic],[data-fl-tilt]').forEach(function(el){
      el.addEventListener('mouseenter',function(){ring.classList.add('fl-big');});
      el.addEventListener('mouseleave',function(){ring.classList.remove('fl-big');});
    });
  }

  /* ---------- magnétique ---------- */
  function initMagnetic(){
    if(RM||COARSE) return;
    $('[data-fl-magnetic]').forEach(function(el){
      var s=parseFloat(el.getAttribute('data-fl-magnetic'))||16;
      el.addEventListener('mousemove',function(e){var r=el.getBoundingClientRect();
        el.style.transform='translate('+((e.clientX-(r.left+r.width/2))/r.width*s)+'px,'+((e.clientY-(r.top+r.height/2))/r.height*s)+'px)';});
      el.addEventListener('mouseleave',function(){el.style.transform='';});
    });
  }

  /* ---------- tilt 3D + reflet ---------- */
  function initTilt(){
    if(RM||COARSE) return;
    $('[data-fl-tilt]').forEach(function(card){
      var g=card.querySelector('.fl-card__gloss');
      card.addEventListener('mousemove',function(e){var r=card.getBoundingClientRect();
        var px=(e.clientX-r.left)/r.width, py=(e.clientY-r.top)/r.height;
        card.style.transform='perspective(900px) rotateY('+((px-.5)*10)+'deg) rotateX('+((.5-py)*10)+'deg)';
        if(g){g.style.setProperty('--gx',px*100+'%');g.style.setProperty('--gy',py*100+'%');}});
      card.addEventListener('mouseleave',function(){card.style.transform='';});
    });
  }

  /* ---------- texte décodé ---------- */
  function initDecode(){
    var CH='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·#%@';
    function run(el){var t=el.getAttribute('data-text');var f=0,tot=t.length*3;
      var iv=setInterval(function(){var o='';for(var i=0;i<t.length;i++){o+=(i<f/3)?t[i]:(t[i]===' '||t[i]==='·'?t[i]:CH[Math.floor(Math.random()*CH.length)]);}
        el.innerHTML=o.replace(/·/g,'<span class="c">·</span>');f++;if(f>tot){clearInterval(iv);el.innerHTML=t.replace(/·/g,'<span class="c">·</span>');}},26);}
    $('.fl-decode[data-text]').forEach(function(el){
      if(RM){el.innerHTML=el.getAttribute('data-text').replace(/·/g,'<span class="c">·</span>');return;}
      run(el); el.addEventListener('mouseenter',function(){run(el);});
    });
  }

  /* ---------- apparition au scroll (robuste : marche même sans IntersectionObserver) ---------- */
  function initReveal(){
    var els=$('.fl-reveal'); if(!els.length) return;
    if(RM){els.forEach(function(e){e.classList.add('fl-in');});return;}
    function reveal(e){e.classList.add('fl-in');}
    function check(){var vh=innerHeight||document.documentElement.clientHeight;
      els.forEach(function(e){if(e.classList.contains('fl-in'))return;var r=e.getBoundingClientRect();if(r.top<vh*0.92&&r.bottom>-40)reveal(e);});}
    check();
    addEventListener('scroll',check,{passive:true});
    addEventListener('resize',check);
    // filets de sécurité : rien ne doit jamais rester caché
    setTimeout(check,400); setTimeout(check,1200);
    setTimeout(function(){els.forEach(reveal);},3500);
  }

  /* ---------- compteurs (robuste) ---------- */
  function initCount(){
    var els=$('[data-fl-count]'); if(!els.length) return;
    function done(el){return el.getAttribute('data-done');}
    function anim(el){if(done(el))return;el.setAttribute('data-done','1');
      var to=parseFloat(el.getAttribute('data-to'))||0,dec=parseInt(el.getAttribute('data-dec')||0),suf=el.getAttribute('data-suf')||'';
      if(RM){el.textContent=(dec?to.toFixed(dec):Math.round(to).toLocaleString('fr-FR'))+suf;return;}
      var st=performance.now();(function a(t){var p=Math.min((t-st)/1200,1);p=1-Math.pow(1-p,3);var v=to*p;
        el.textContent=(dec?v.toFixed(dec):Math.round(v).toLocaleString('fr-FR'))+suf;if(p<1)requestAnimationFrame(a);})(st);}
    function check(){var vh=innerHeight||document.documentElement.clientHeight;
      els.forEach(function(e){if(done(e))return;var r=e.getBoundingClientRect();if(r.top<vh*0.92&&r.bottom>-40)anim(e);});}
    check(); addEventListener('scroll',check,{passive:true}); addEventListener('resize',check);
    setTimeout(check,600); setTimeout(function(){els.forEach(anim);},3500);
  }

  /* ---------- fond WebGL (pages hero seulement) ---------- */
  function initShader(){
    var c=document.querySelector('canvas.fl-gl[data-fl-shader]'); if(!c) return;
    if(RM){c.style.display='none';return;}
    var gl=c.getContext('webgl'); if(!gl){c.style.display='none';return;} // fallback: .fl-bg reste visible
    var mouse=[.5,.5],tM=[.5,.5],t0=performance.now(),running=true;
    function rs(){var d=Math.min(devicePixelRatio||1,1.5);c.width=innerWidth*d;c.height=innerHeight*d;gl.viewport(0,0,c.width,c.height);}
    rs();addEventListener('resize',rs);
    var vs='attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    var fs='precision highp float;uniform vec2 uRes;uniform float uT;uniform vec2 uM;'
      +'float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}'
      +'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}'
      +'float fbm(vec2 p){float a=.5,v=0.;for(int i=0;i<5;i++){v+=a*n(p);p*=2.03;a*=.5;}return v;}'
      +'void main(){vec2 p=(gl_FragCoord.xy-.5*uRes)/uRes.y;vec2 m=(uM-.5)*1.4;float t=uT*.05;'
      +'vec2 q=vec2(fbm(p*1.4+t),fbm(p*1.4+vec2(5.2,1.3)));'
      +'vec2 r=vec2(fbm(p*1.4+2.*q+vec2(1.7,9.2)+.35*m),fbm(p*1.4+2.*q+vec2(8.3,2.8)-.35*m));'
      +'float f=fbm(p*1.4+3.*r+t);'
      +'vec3 cy=vec3(.10,.78,.86),vi=vec3(.49,.23,.93),mg=vec3(.88,.32,.72);'
      +'vec3 col=mix(cy,vi,smoothstep(.15,.6,f));col=mix(col,mg,smoothstep(.55,.92,f));col*=.16+.9*f;'
      +'float vig=smoothstep(1.3,.15,length(p));col*=.28+.85*vig;gl_FragColor=vec4(pow(col,vec3(.92)),1.);}';
    function sh(t,s){var o=gl.createShader(t);gl.shaderSource(o,s);gl.compileShader(o);return o;}
    var pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,vs));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,fs));gl.linkProgram(pr);gl.useProgram(pr);
    var b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    var loc=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    var uRes=gl.getUniformLocation(pr,'uRes'),uT=gl.getUniformLocation(pr,'uT'),uM=gl.getUniformLocation(pr,'uM');
    function draw(){if(!running)return;var t=(performance.now()-t0)/1000;tM[0]+=(mouse[0]-tM[0])*.05;tM[1]+=(mouse[1]-tM[1])*.05;
      gl.uniform2f(uRes,c.width,c.height);gl.uniform1f(uT,t);gl.uniform2f(uM,tM[0],tM[1]);gl.drawArrays(gl.TRIANGLES,0,3);requestAnimationFrame(draw);}
    draw();
    // perf : pause si onglet caché ou hero hors écran
    document.addEventListener('visibilitychange',function(){running=!document.hidden;if(running)draw();});
    if('IntersectionObserver'in window){new IntersectionObserver(function(es){es.forEach(function(e){running=e.isIntersecting&&!document.hidden;if(running)draw();});},{threshold:0}).observe(c);}
    window.__flShader={mouse:function(x,y){mouse=[x/innerWidth,1-y/innerHeight];}};
  }

  function init(){initShader();initCursor();initMagnetic();initTilt();initDecode();initReveal();initCount();}
  if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded',init);
  window.FLUI={init:init};
})();
