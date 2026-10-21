from PIL import Image,ImageDraw,ImageFont
W,H=1040,376
im=Image.new('RGB',(W,H),(246,246,242));d=ImageDraw.Draw(im)
d.rounded_rectangle([6,6,W-7,H-7],28,outline=(30,30,30),width=10)
d.rounded_rectangle([22,22,W-23,H-23],20,outline=(60,60,60),width=3)
f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',150)
t="RG";tb=d.textbbox((0,0),t,font=f)
# RG in brand red + MOTORS black
f2=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',118)
t2="MOTORS"
w1=tb[2]-tb[0];tb2=d.textbbox((0,0),t2,font=f2);w2=tb2[2]-tb2[0];gap=26
x=(W-(w1+gap+w2))/2
d.text((x-tb[0],145-(tb[3]+tb[1])/2),t,font=f,fill=(200,16,46))
d.text((x+w1+gap-tb2[0],145-(tb2[3]+tb2[1])/2),t2,font=f2,fill=(20,20,20))
f3=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',46)
t3="· C H I L E ·";tb3=d.textbbox((0,0),t3,font=f3)
d.text(((W-(tb3[2]-tb3[0]))/2-tb3[0],300-(tb3[3]+tb3[1])/2),t3,font=f3,fill=(70,70,70))
im.save('rgplate.png')
