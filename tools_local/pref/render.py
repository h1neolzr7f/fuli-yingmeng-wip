import json,sys,subprocess
from PIL import Image,ImageDraw
d=json.load(open(sys.argv[1])); out=sys.argv[2]; lab=sys.argv[3] if len(sys.argv)>3 else ''
W,H=460,580
p=subprocess.Popen(['ffmpeg','-y','-loglevel','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{W}x{H}','-r','30','-i','-','-c:v','libx264','-profile:v','main','-pix_fmt','yuv420p','-crf','26','-movflags','+faststart',out],stdin=subprocess.PIPE)
for fr in d['frames']:
  im=Image.new('RGB',(W,H),(12,12,28)); g=ImageDraw.Draw(im)
  bx,by,hp,mh=fr['b']; g.rectangle([10,8,10+(W-20)*hp/mh,14],fill=(200,60,200))
  g.ellipse([bx-18,by-18,bx+18,by+18],fill=(155,89,182))
  for x,y in fr['pb']: g.rectangle([x-1,y-5,x+1,y+5],fill=(120,255,160))
  for x,y,r,c in fr['bu']:
    try: g.ellipse([x-r,y-r,x+r,y+r],fill=c)
    except Exception: g.ellipse([x-r,y-r,x+r,y+r],fill=(255,255,255))
  px,py,inv=fr['p'][:3]; fi=fr['p'][3] if len(fr['p'])>3 else 0
  if inv: g.ellipse([px-16,py-16,px+16,py+16],outline=(80,220,255),width=2)
  if not inv or (fi//6)%2==0: g.polygon([(px,py-9),(px-7,py+7),(px+7,py+7)],outline=(231,76,60))
  g.ellipse([px-3.5,py-3.5,px+3.5,py+3.5],fill=(255,255,255),outline=(255,40,40))
  g.text((10,34),f"hits {fr.get('hit',0)}"+("  INVINCIBLE" if inv else ""),fill=(80,220,255) if inv else (200,200,200))
  g.text((10,20),f"{lab}  score {fr['s']}  lives {fr['l']}  graze {fr['gz']}",fill=(230,230,230))
  p.stdin.write(im.tobytes())
p.stdin.close(); p.wait()
