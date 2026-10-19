import json, math, subprocess, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
W,H=1280,720; FPS=30
log=json.load(open('/workspace/pov_log_dodge.json'))
FONT='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
def F(s): return ImageFont.truetype(FONT,s)
f12,f14,f16,f20,f26,f34,f52=F(12),F(14),F(16),F(20),F(26),F(34),F(52)
# arena layout
AS=1.12; AX,AY=24,58; AW,AH=int(460*AS),int(580*AS)
# mosaic
MC=(812,318); MR=205; RV=330.0; HEX=8.6
cent=[]
dy=HEX*1.5; dx=HEX*math.sqrt(3)
for j in range(-30,31):
  for i in range(-30,31):
    x=i*dx+(j%2)*dx/2; y=j*dy
    if math.hypot(x,y)<=MR-HEX*0.6: cent.append((x,y))
cent=np.array(cent); NOM=len(cent); print('ommatidia',NOM,file=sys.stderr)
r=np.hypot(cent[:,0],cent[:,1])/MR; th=np.arctan2(cent[:,1],cent[:,0])
dist=RV*r**1.55   # fisheye: centre magnified
offx=dist*np.cos(th); offy=dist*np.sin(th)
hexpts=[(HEX*0.93*math.cos(math.pi/6+k*math.pi/3),HEX*0.93*math.sin(math.pi/6+k*math.pi/3)) for k in range(6)]
def arena_to_mosaic(dxa,dya):
  d=math.hypot(dxa,dya); 
  rr=(d/RV)**(1/1.55); a=math.atan2(dya,dxa)
  return MC[0]+rr*MR*math.cos(a), MC[1]+rr*MR*math.sin(a), rr
# overlays
yy,xx=np.mgrid[0:H,0:W]
vig=np.clip(((xx-W/2)/(W*0.62))**2+((yy-H/2)/(H*0.62))**2,0,1)**1.6
scan=((yy%3)==0)*0.10
dark=np.clip(vig*0.55+scan,0,0.8)[...,None]
# 9 moves
DIRS=[(dx_,dy_) for dy_ in (-1,0,1) for dx_ in (-1,0,1)]
NAMES={(-1,0):'向左闪避',(1,0):'向右闪避',(0,-1):'向上闪避',(0,1):'向下闪避',(-1,-1):'左上闪避',(1,-1):'右上闪避',(-1,1):'左下闪避',(1,1):'右下闪避',(0,0):'原地不动'}
ARW={(-1,0):'←',(1,0):'→',(0,-1):'↑',(0,1):'↓',(-1,-1):'↖',(1,-1):'↗',(-1,1):'↙',(1,1):'↘',(0,0):'●'}
def glow_text(d,xy,s,font,fill,anchor='la'):
  for o in ((-2,0),(2,0),(0,-2),(0,2)): d.text((xy[0]+o[0],xy[1]+o[1]),s,font=font,fill=(0,0,0),anchor=anchor)
  d.text(xy,s,font=font,fill=fill,anchor=anchor)
def card(lines,alpha=1.0):
  im=Image.new('RGB',(W,H),(10,8,4)); d=ImageDraw.Draw(im)
  for k in range(0,W,40):
    d.line([(k,0),(k,H)],fill=(22,16,6))
  y=H//2-40*len(lines)//2
  for s,font,col in lines:
    d.text((W//2,y),s,font=font,fill=col,anchor='mm'); y+=font.size+22
  a=np.asarray(im).astype(np.float32)*(1-dark)*alpha
  return a.astype(np.uint8)
ff=subprocess.Popen(['nice','-n','19','ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r',str(FPS),'-i','-',
  '-c:v','libx264','-profile:v','main','-pix_fmt','yuv420p','-preset','medium','-crf','24','-maxrate','1700k','-bufsize','3400k','-movflags','+faststart','-threads','2','/workspace/fly_dodge_master.mp4'],stdin=subprocess.PIPE)
def emit(a): ff.stdin.write(np.ascontiguousarray(a).tobytes())
intro=[('果蝇视角',f52,(255,196,90)),('FLY\'S-EYE VIEW · 2000 个真实神经元的连接组大脑',f20,(230,210,170)),('v3 复眼 · 严格判定 · 3 条命',f16,(180,160,120))]
for k in range(75): emit(card(intro,min(1,k/15)))
# state
fx_dop=0; fx_hit=0; fx_graze=0; cap=''; cap_t=0; prev=log[0]; flash=0
trail=[]
for n,s in enumerate(log):
  im=Image.new('RGB',(W,H),(8,7,12)); d=ImageDraw.Draw(im,'RGBA')
  # events
  if s['boss'][2]<prev['boss'][2]-0.01: fx_dop=14
  if s['hits']>prev['hits']: fx_hit=24
  if s['graze']>prev['graze']: fx_graze=18; cap,cap_t='擦弹!',22
  px,py=s['p']; bx,by,bhp,bmax=s['boss']
  B=np.array([b[:4] for b in s['b']],dtype=np.float32).reshape(-1,4)
  ddx=B[:,0]-px; ddy=B[:,1]-py; dd=np.hypot(ddx,ddy)+1e-6
  ap=np.clip(-(ddx*B[:,2]+ddy*B[:,3])/dd/3,0,1)*np.clip(1-dd/700,0,1)
  loom=(ap>0.35)&(dd<130)
  danger=bool((loom&(dd<90)).any())
  # ---------- arena ----------
  d.rectangle([AX-3,AY-3,AX+AW+3,AY+AH+3],outline=(120,90,40),width=2)
  d.rectangle([AX,AY,AX+AW,AY+AH],fill=(14,12,26))
  for k in range(0,AH,28): d.line([(AX,AY+k),(AX+AW,AY+k)],fill=(20,18,36))
  S=lambda x,y:(AX+x*AS,AY+y*AS)
  for (x,y) in s['pb']:
    X,Y=S(x,y); d.rectangle([X-1.5,Y-5,X+1.5,Y+5],fill=(255,240,140,200))
  X,Y=S(bx,by)
  for rr,al in ((40,40),(30,70)): d.ellipse([X-rr,Y-rr,X+rr,Y+rr],fill=(200,60,255,al))
  d.ellipse([X-20,Y-20,X+20,Y+20],fill=(150,40,200),outline=(255,170,255),width=3)
  d.text((X,Y),'BOSS',font=f12,fill='white',anchor='mm')
  for i,b in enumerate(s['b']):
    X,Y=S(b[0],b[1]); rad=b[4]*AS+1.5
    col=(255,70,60) if loom[i] else (120,200,255)
    d.ellipse([X-rad-2,Y-rad-2,X+rad+2,Y+rad+2],fill=col+(90,)); d.ellipse([X-rad,Y-rad,X+rad,Y+rad],fill=(245,245,255),outline=col)
  X,Y=S(px,py)
  inv=fx_hit>0 and (n//2)%2
  if not inv:
    d.polygon([(X,Y-14),(X-10,Y+10),(X+10,Y+10)],fill=(80,220,200),outline=(200,255,240))
  d.ellipse([X-28*AS,Y-28*AS,X+28*AS,Y+28*AS],outline=(255,255,255,40))
  d.ellipse([X-3.5*AS-1,Y-3.5*AS-1,X+3.5*AS+1,Y+3.5*AS+1],fill=(255,255,255),outline=(255,40,40),width=2)  # hitbox
  # boss hp bar
  d.rectangle([AX,AY-26,AX+AW,AY-14],fill=(40,20,40)); d.rectangle([AX,AY-26,AX+AW*max(0,bhp)/bmax,AY-14],fill=(230,80,160))
  d.text((AX,AY-46),f'Boss HP {max(0,bhp):.0f}/{bmax}',font=f14,fill=(240,200,230))
  lives='♥'*max(0,s['lives'])+'♡'*max(0,3-s['lives'])
  d.text((AX+AW,AY-46),f'命 {lives}   擦弹 {s["graze"]}   t={s["f"]/60:4.1f}s',font=f14,fill=(220,230,240),anchor='ra')
  d.text((AX,AY+AH+10),'普通视角 · 白点 = 判定点（严格模式）',font=f14,fill=(170,160,140))
  # ---------- mosaic ----------
  vals=np.zeros(NOM); red=np.zeros(NOM)
  if len(B):
    ox=offx[:,None]+px; oy=offy[:,None]+py
    g=np.exp(-((ox-B[None,:,0])**2+(oy-B[None,:,1])**2)/(2*(9+0.04*dist[:,None])**2))
    vals=np.clip(g.sum(1),0,1.4); red=np.clip((g*(loom[None,:]*1.0)).max(1),0,1)
  # boss region in mosaic: attenuate bullets there
  bmx,bmy,brr=arena_to_mosaic(bx-px,by-py)
  inview=brr<=0.97
  if inview:
    near=np.hypot(cent[:,0]+MC[0]-bmx,cent[:,1]+MC[1]-bmy)<34
    vals[near]*=0.35; red[near]*=0.35
  # arena walls outside -> dark
  ax_=offx+px; ay_=offy+py; out=(ax_<0)|(ax_>460)|(ay_<0)|(ay_>580)
  pulse=0.5+0.5*math.sin(n*0.9)
  base=np.array([70,42,10]); bright=np.array([255,214,120]); rcol=np.array([255,50,30])
  for k in range(NOM):
    cx,cy=cent[k,0]+MC[0],cent[k,1]+MC[1]
    if out[k]: c=(26,16,6)
    else:
      v=min(1,vals[k]); c=base*(1-v)+bright*v
      if red[k]>0.15: c=c*(1-red[k]*(0.5+0.5*pulse))+rcol*red[k]*(0.5+0.5*pulse)
      c=tuple(int(t) for t in c)
    shade=1-0.35*r[k]**2
    d.polygon([(cx+a*1,cy+b_) for a,b_ in hexpts],fill=tuple(int(t*shade) for t in c))
  d.ellipse([MC[0]-MR-4,MC[1]-MR-4,MC[0]+MR+4,MC[1]+MR+4],outline=(160,110,40),width=3)
  # fly at centre
  d.ellipse([MC[0]-5,MC[1]-5,MC[0]+5,MC[1]+5],fill=(80,255,220),outline='white')
  # escape path arrow (chosen move)
  mx,my=s['m']; mag=math.hypot(mx,my)
  if mag>0.15:
    L=40+70*min(1,mag); ex,ey=MC[0]+mx/mag*L,MC[1]+my/mag*L
    d.line([MC,(ex,ey)],fill=(80,255,160,230),width=5)
    a=math.atan2(my,mx)
    d.polygon([(ex+12*math.cos(a),ey+12*math.sin(a)),(ex+8*math.cos(a+2.3),ey+8*math.sin(a+2.3)),(ex+8*math.cos(a-2.3),ey+8*math.sin(a-2.3))],fill=(80,255,160))
  # boss top layer
  if inview:
    for rr,al in ((30,50),(22,90)): d.ellipse([bmx-rr,bmy-rr,bmx+rr,bmy+rr],outline=(255,90,255,al),width=4)
    d.ellipse([bmx-15,bmy-15,bmx+15,bmy+15],outline=(255,255,255),width=2)
    d.ellipse([bmx-11,bmy-11,bmx+11,bmy+11],outline=(255,60,230),width=3)
    glow_text(d,(bmx,bmy-36),'敌人',f14,(255,150,255),'mm')
    d.line([MC,(bmx,bmy)],fill=(255,120,255,70),width=2)
  else:
    a=math.atan2(by-py,bx-px); ex,ey=MC[0]+(MR-14)*math.cos(a),MC[1]+(MR-14)*math.sin(a)
    d.polygon([(ex+16*math.cos(a),ey+16*math.sin(a)),(ex+10*math.cos(a+2.4),ey+10*math.sin(a+2.4)),(ex+10*math.cos(a-2.4),ey+10*math.sin(a-2.4))],fill=(255,80,240),outline='white')
    glow_text(d,(ex-22*math.cos(a),ey-22*math.sin(a)),'敌',f14,(255,150,255),'mm')
  glow_text(d,(MC[0]-MR,40),'果蝇视角 · 复眼马赛克',f20,(255,200,110))
  d.text((MC[0]-MR,MC[1]+MR+14),f'{NOM} 个小眼 · 鱼眼 · 红闪 = 逼近子弹 · 绿箭头 = 闪避路径',font=f12,fill=(190,160,110))
  # ---------- LC heatmap ----------
  HX,HY,CS=1062,72,9
  d.text((HX,HY-22),'LC/LPLC 视觉神经元',font=f14,fill=(230,200,150))
  lc=s['lc']
  for k,v in enumerate(lc):
    i,j=k%20,k//20; v=max(-1,min(1,v))
    c=(int(255*max(0,v)),int(180*max(0,v)**1.5+20),int(40+180*max(0,-v)))
    d.rectangle([HX+i*CS,HY+j*CS,HX+i*CS+CS-1,HY+j*CS+CS-1],fill=c)
  # DN bars
  DY=HY+20*CS+30; d.text((HX,DY-20),'下行神经元 DN ×16',font=f14,fill=(230,200,150))
  for k,v in enumerate(s['dn']):
    v=max(-4,min(4,v))/4; x0=HX+k*11; ymid=DY+28
    d.rectangle([x0,min(ymid,ymid-v*26),x0+8,max(ymid,ymid-v*26)],fill=(90,220,255) if v>0 else (255,120,90))
  # ---------- 9-move compass ----------
  CX,CY,CR=1150,560,62
  sc=s['sc']; h=sc[1]-sc[0]; v=sc[3]-sc[2]
  pref=[]
  for (a,b_) in DIRS:
    if a==0 and b_==0: pref.append(0.0)
    else: pref.append((a*h+b_*v)/math.hypot(a,b_))
  pref=np.array(pref); e=np.exp((pref-pref.max())/max(0.3,pref.std()+1e-6)); pp=e/e.sum()
  q=(0 if abs(mx)<0.3 else (1 if mx>0 else -1),0 if abs(my)<0.3 else (1 if my>0 else -1))
  d.text((CX,CY-CR-38),'9 选 1 闪避决策',font=f14,fill=(230,200,150),anchor='mm')
  d.ellipse([CX-CR-14,CY-CR-14,CX+CR+14,CY+CR+14],outline=(90,70,40),width=2)
  for k,(a,b_) in enumerate(DIRS):
    if a==0 and b_==0: ox_,oy_=CX,CY
    else:
      ang=math.atan2(b_,a); ox_,oy_=CX+CR*math.cos(ang),CY+CR*math.sin(ang)
      bl=8+34*pp[k]/pp.max(); d.line([(CX+18*math.cos(ang),CY+18*math.sin(ang)),(CX+(18+bl)*math.cos(ang),CY+(18+bl)*math.sin(ang))],fill=(255,190,80,int(80+170*pp[k]/pp.max())),width=7)
    chosen=(a,b_)==q
    rr=13 if chosen else 10
    fill=(60,230,140) if chosen else (int(40+150*pp[k]/pp.max()),int(30+100*pp[k]/pp.max()),20)
    d.ellipse([ox_-rr,oy_-rr,ox_+rr,oy_+rr],fill=fill,outline='white' if chosen else (120,90,40),width=2)
    d.text((ox_,oy_),ARW[(a,b_)],font=f12,fill='white',anchor='mm')
  d.text((CX,CY+CR+30),'条长 = DN 驱动偏好 · 绿 = 选中',font=f12,fill=(170,150,110),anchor='mm')
  # dodge caption
  if danger and q!=(0,0) and cap_t<=0: cap,cap_t=NAMES[q],20
  # ---------- labels ----------
  if danger: glow_text(d,(MC[0],MC[1]-MR-2),'⚠ 危险逼近!',f26,(255,70,60) if (n//3)%2 else (255,200,80),'mm')
  if cap_t>0: glow_text(d,(MC[0],MC[1]+MR-40),cap,f34,(120,255,180) if cap!='擦弹!' else (130,220,255),'mm'); cap_t-=1
  if fx_dop>0: glow_text(d,(1150,400),'多巴胺 +',f26,(120,255,120),'mm'); fx_dop-=1
  if fx_hit>0:
    glow_text(d,(1150,400 if fx_dop<=0 else 434),'多巴胺 −  中弹!',f26,(255,80,80),'mm'); fx_hit-=1
    d.rectangle([0,0,W,H],outline=(255,0,0,int(160*fx_hit/24)),width=10)
  if s['dead']: glow_text(d,(AX+AW/2,AY+AH/2),'满身疮痍 · 本局结束',f34,(255,120,120),'mm')
  d.text((W-16,H-18),'connectome: MaleCNS v1.0 slim2k+MB · dodge master dmB2_e1.8 · seed 110072 best of 150 scanned (cherry-picked; 9/150 no-hit) · 0 hits, 52 graze, 0% edge · strict x1.4 · 30s full clear',font=f12,fill=(130,120,100),anchor='rm')
  a=np.asarray(im).astype(np.float32)
  a[:,560:]=a[:,560:]*(1-dark[:,560:])
  emit(a.clip(0,255).astype(np.uint8)); prev=s
L=log[-1]
outro=[('本局战报',f34,(255,196,90)),(f'存活 {L["f"]/60:.1f} 秒 · 擦弹 {L["graze"]} 次 · Boss 伤害 {L["boss"][3]-L["boss"][2]:.0f}/{L["boss"][3]}',f20,(230,210,170)),('一只 2000 神经元的果蝇，用复眼看弹幕、自己决定往哪躲',f16,(180,160,120))]
for k in range(90): emit(card(outro,min(1,k/15)))
ff.stdin.close(); ff.wait(); print('done',file=sys.stderr)
