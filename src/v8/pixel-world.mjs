/** Original code-drawn pixel scenery and enemies; no external art license needed. */
const palettes=[['#8caa86','#546f63','#273f3f'],['#789788','#345f57','#153e39'],['#5e657a','#393850','#242438'],['#92959a','#555d6b','#323c4d']];
const rect=(ctx,color,x,y,w,h)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h)};
export function paintMap(ctx,map){
 const [sky,mid,dark]=palettes[map];ctx.clearRect(0,0,256,144);rect(ctx,sky,0,0,256,144);
 rect(ctx,map===2?'#b0a389':'#c8c19a',184,18,18,18);
 for(let i=0;i<10;i++){const x=i*32-20,y=50+(i*37%35);rect(ctx,mid,x,y,48,144-y);rect(ctx,mid,x+8,y-8,32,8)}
 if(map===1)for(let i=0;i<12;i++){
  const x=i*23+5;rect(ctx,dark,x,10+(i%3)*8,4,134);for(let y=35;y<120;y+=19){rect(ctx,'#609879',x-7,y,18,2);rect(ctx,'#aac196',x,y,4,2)}
 }
 if(map===2)for(let i=0;i<7;i++){
  const x=i*43;rect(ctx,dark,x,32,10,112);rect(ctx,dark,x-11,48,18,7);rect(ctx,dark,x+8,62,18,7);rect(ctx,'#82858b',x+17,88,2,3);
 }
 if(map===3)for(let i=0;i<9;i++){
  const x=i*31+9,y=80+(i%3)*7;rect(ctx,'#b4b8b0',x,y,3,35);rect(ctx,'#777f89',x-5,y+8,14,3);rect(ctx,'#3d4657',x+3,y+3,2,28);
 }
 rect(ctx,dark,0,130,256,14);rect(ctx,mid,0,130,256,3);
}
export function paintFoe(ctx,map,boss=false,frame=0,attack=false){
 ctx.clearRect(0,0,192,192);ctx.save();ctx.scale(4,4);
 const bob=frame%2,shift=attack?-2:0;ctx.translate(shift,2+bob);
 const colors=[['#6c7781','#c2c8bb'],['#315f51','#87bb9a'],['#66608b','#b9a9c8'],['#596879','#9dadb7']][map];
 const [body,light]=colors;
 if(map===0){
  rect(ctx,body,12,25,26,12);rect(ctx,light,8,18,13,14);rect(ctx,body,8,13,5,9);rect(ctx,body,17,14,5,8);
  rect(ctx,body,13,36,5,7);rect(ctx,body,31,36,5,7);rect(ctx,light,3,26,10,5);rect(ctx,body,36,20,8,5);
  rect(ctx,'#d7775c',10,23,3,2);rect(ctx,light,29,26,6,3);
 }else if(map===1){
  rect(ctx,body,15,16,20,25);rect(ctx,light,12,15,11,8);rect(ctx,body,12,13,6,7);rect(ctx,body,28,11,5,9);
  rect(ctx,light,11,38,12,5);rect(ctx,light,31,37,7,6);rect(ctx,'#d8cc89',15,22,3,2);rect(ctx,'#d8cc89',25,22,3,2);
  rect(ctx,body,6,23,10,6);rect(ctx,body,33,24,8,6);
 }else if(map===2){
  rect(ctx,body,12,20,25,18);rect(ctx,body,16,13,16,25);rect(ctx,light,19,19,4,3);rect(ctx,light,28,19,4,3);
  for(let i=0;i<5;i++)rect(ctx,body,12+i*5,36,3,7-(i%2)*3);
  rect(ctx,light,7,25,7,3);rect(ctx,light,35,27,7,3);
 }else{
  rect(ctx,body,14,22,23,14);rect(ctx,light,19,12,12,12);rect(ctx,light,15,36,6,7);rect(ctx,light,30,36,6,7);
  rect(ctx,body,8,19,6,16);rect(ctx,body,37,19,5,16);rect(ctx,'#d9cc89',22,17,7,2);
  rect(ctx,light,6,9,2,22);rect(ctx,light,2,25,10,2);
 }
 if(boss){rect(ctx,'#c0a66b',16,7,19,3);rect(ctx,'#c0a66b',16,4,3,6);rect(ctx,'#e1c57c',24,2,3,8);rect(ctx,'#c0a66b',32,4,3,6);rect(ctx,'#cc655b',20,17,3,2)}
 ctx.restore();
}
