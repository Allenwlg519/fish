/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import p5 from 'p5';

// --- 配置变量 ---
const BG_COLOR = '#0a192f';
const FISH_COLOR = '#3498db';
const SPOT_COLOR = '#2980b9';
const ORB_COLOR = '#ff4757'; // 鲜艳的红色
const EYE_COLOR = '#ffffff';
const EYE_PUPIL = '#000000';

const FISH_COUNT = 200;
const SPRITE_FRAMES = 20; // 动画帧数
const FISH_WIDTH = 60;
const FISH_HEIGHT = 30;
const REPULSION_RADIUS = 150;
const FRICTION = 0.92; // 摩擦力系数
const FLUSH_FRICTION = 0.85; // flushOut 时的摩擦力系数（更紧凑）

const GLOBAL_ANGLE = -60; // 鱼群运动角度

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const sketch = (p: p5) => {
      let spriteSheet: p5.Graphics;
      let fishes: Fish[] = [];
      let orb: Orb;
      let flushOut = false;
      let flushStartTime = 0;

      // --- 鱼类绘制函数 (用于预渲染) ---
      const drawFishFrame = (pg: p5.Graphics, phase: number) => {
        pg.push();
        pg.translate(FISH_WIDTH / 2, FISH_HEIGHT / 2);
        
        // 鱼身 - 贝塞尔曲线
        pg.noStroke();
        pg.fill(FISH_COLOR);
        // 使用 bezier 直接绘制两半鱼身并填充
        pg.beginShape();
        pg.vertex(-25, 0);
        (pg as any).bezierVertex(-15, -15, 15, -15, 25, 0);
        (pg as any).bezierVertex(15, 15, -15, 15, -25, 0);
        pg.endShape(p.CLOSE);

        // 斑点 - 随机分布 (固定种子保证每帧斑点位置一致)
        pg.randomSeed(42);
        pg.fill(SPOT_COLOR);
        for (let i = 0; i < 8; i++) {
          let rx = pg.random(-15, 15);
          let ry = pg.random(-5, 5);
          pg.ellipse(rx, ry, pg.random(2, 5));
        }

        // 鱼尾 - 根据 sin(phase) 摆动
        let tailSwing = p.sin(phase) * 15;
        pg.push();
        pg.translate(-25, 0);
        pg.rotate(p.radians(tailSwing));
        pg.fill(FISH_COLOR);
        pg.beginShape();
        pg.vertex(0, 0);
        (pg as any).bezierVertex(-15, -10, -15, 10, 0, 0);
        pg.endShape(p.CLOSE);
        pg.pop();

        // 眼睛
        pg.fill(EYE_COLOR);
        pg.ellipse(18, -4, 6, 6);
        pg.fill(EYE_PUPIL);
        pg.ellipse(19, -4, 3, 3);
        pg.fill(255, 200); // 高光
        pg.ellipse(17, -5, 2, 2);

        pg.pop();
      };

      // --- Fish 类 ---
      class Fish {
        pos: p5.Vector;
        vel: p5.Vector;
        depth: number;
        phase: number;
        phaseOffset: number;
        offsetX: number;
        offsetY: number;
        id: number;

        constructor(id: number) {
          this.id = id;
          this.pos = p.createVector(p.random(p.width), p.random(p.height));
          this.depth = p.random(0, 1);
          this.phaseOffset = p.random(p.TWO_PI);
          this.phase = 0;
          this.offsetX = 0;
          this.offsetY = 0;
          
          let angleRad = p.radians(GLOBAL_ANGLE);
          let speed = p.map(this.depth, 0, 1, 1, 3);
          this.vel = p.createVector(p.cos(angleRad) * speed, p.sin(angleRad) * speed);
        }

        update() {
          // 基础运动
          let currentSpeedMult = 1;
          if (flushOut) {
            let t = p.constrain((p.millis() - flushStartTime) / 2000, 0, 1);
            // 三次方缓动加速: t^3
            currentSpeedMult = 1 + (t * t * t) * 5;
          }

          this.pos.x += this.vel.x * currentSpeedMult;
          this.pos.y += this.vel.y * currentSpeedMult;

          // 水流起伏感 (正弦波)
          this.pos.y += p.sin(p.frameCount * 0.05 + this.phaseOffset) * 0.5;

          // 排斥逻辑
          if (orb && orb.pos) {
            let d = p.dist(this.pos.x + this.offsetX, this.pos.y + this.offsetY, orb.pos.x, orb.pos.y);
            if (d < REPULSION_RADIUS) {
              let force = p.map(d, 0, REPULSION_RADIUS, 15, 0);
              let dir = p.createVector(this.pos.x + this.offsetX - orb.pos.x, this.pos.y + this.offsetY - orb.pos.y);
              dir.normalize();
              this.offsetX += dir.x * force;
              this.offsetY += dir.y * force;
            }
          }

          // 摩擦力衰减
          let f = flushOut ? FLUSH_FRICTION : FRICTION;
          this.offsetX *= f;
          this.offsetY *= f;

          // 边界重置
          if (this.pos.x < -100 || this.pos.x > p.width + 100 || this.pos.y < -100 || this.pos.y > p.height + 100) {
            this.reset();
          }

          this.phase = (p.frameCount * 0.2 + this.phaseOffset) % p.TWO_PI;
        }

        reset() {
          let angleRad = p.radians(GLOBAL_ANGLE);
          let vx = p.cos(angleRad);
          let vy = p.sin(angleRad);

          // 随机选择重置到左/右边缘还是上/下边缘，以保持均匀分布
          // 根据运动方向选择“入口”边缘
          if (p.random() > 0.5) {
            // 重置到 X 轴边缘 (左或右)
            this.pos.x = vx > 0 ? -100 : p.width + 100;
            this.pos.y = p.random(p.height);
          } else {
            // 重置到 Y 轴边缘 (上或下)
            this.pos.x = p.random(p.width);
            this.pos.y = vy > 0 ? -100 : p.height + 100;
          }
          
          this.offsetX = 0;
          this.offsetY = 0;
        }

        draw() {
          let frameIdx = p.floor(p.map(p.sin(this.phase), -1, 1, 0, SPRITE_FRAMES - 1));
          let size = p.map(this.depth, 0, 1, 0.4, 1.2);
          let alpha = p.map(this.depth, 0, 1, 100, 255);

          p.push();
          p.translate(this.pos.x + this.offsetX, this.pos.y + this.offsetY);
          p.rotate(p.radians(GLOBAL_ANGLE));
          p.scale(size);
          p.tint(255, alpha);
          
          // 精灵图切片渲染
          p.image(
            spriteSheet,
            -FISH_WIDTH / 2, -FISH_HEIGHT / 2,
            FISH_WIDTH, FISH_HEIGHT,
            frameIdx * FISH_WIDTH, 0,
            FISH_WIDTH, FISH_HEIGHT
          );
          p.pop();
        }
      }

      // --- Orb 类 (粉鱼) ---
      class Orb {
        pos: p5.Vector;
        vel: p5.Vector;

        constructor() {
          // 初始位置在屏幕右侧或上方，准备逆流而上
          this.pos = p.createVector(p.width * 0.9, p.height * 0.1);
          
          // 逆着全局角度游动 (GLOBAL_ANGLE + 180)
          let oppositeAngle = p.radians(GLOBAL_ANGLE + 180);
          let speed = 2.5;
          this.vel = p.createVector(p.cos(oppositeAngle) * speed, p.sin(oppositeAngle) * speed);
        }

        update() {
          this.pos.x += this.vel.x;
          this.pos.y += this.vel.y;

          // 屏幕环绕：确保它始终从鱼群的前方出现并逆流而行
          if (this.pos.x < -50) this.pos.x = p.width + 50;
          if (this.pos.x > p.width + 50) this.pos.x = -50;
          if (this.pos.y < -50) this.pos.y = p.height + 50;
          if (this.pos.y > p.height + 50) this.pos.y = -50;

          // 触发 flushOut (当红鱼靠近鱼群密集区时触发加速反应)
          if (!flushOut && p.dist(this.pos.x, this.pos.y, p.width * 0.5, p.height * 0.5) < 200) {
            flushOut = true;
            flushStartTime = p.millis();
          }
        }

        draw() {
          p.push();
          p.translate(this.pos.x, this.pos.y);
          p.rotate(this.vel.heading());
          
          // 绘制红鱼身体
          p.noStroke();
          p.fill(ORB_COLOR);
          p.ellipse(0, 0, 40, 20);
          
          // 鱼尾摆动
          let tailPhase = p.sin(p.millis() * 0.01);
          p.push();
          p.translate(-18, 0);
          p.rotate(tailPhase * 0.3);
          p.beginShape();
          p.vertex(0, 0);
          p.bezierVertex(-10, -10, -15, -15, -20, -10);
          p.bezierVertex(-18, -5, -18, 5, -20, 10);
          p.bezierVertex(-15, 15, -10, 10, 0, 0);
          p.endShape(p.CLOSE);
          p.pop();

          // 眼睛
          p.fill(255, 150);
          p.ellipse(10, -4, 8, 8);
          p.fill(0);
          p.ellipse(11, -4, 4, 4);
          
          p.pop();
        }
      }

      p.setup = () => {
        p.createCanvas(p.windowWidth, p.windowHeight);
        
        // 创建精灵图画布
        spriteSheet = p.createGraphics(FISH_WIDTH * SPRITE_FRAMES, FISH_HEIGHT);
        for (let i = 0; i < SPRITE_FRAMES; i++) {
          let phase = p.map(i, 0, SPRITE_FRAMES, 0, p.TWO_PI);
          p.push();
          spriteSheet.push();
          spriteSheet.translate(i * FISH_WIDTH, 0);
          drawFishFrame(spriteSheet, phase);
          spriteSheet.pop();
          p.pop();
        }

        // 初始化鱼群
        for (let i = 0; i < FISH_COUNT; i++) {
          fishes.push(new Fish(i));
        }

        orb = new Orb();
      };

      p.draw = () => {
        p.background(BG_COLOR);

        // 更新逻辑
        orb.update();
        for (let fish of fishes) {
          fish.update();
        }

        // 深度排序 (depth 映射伪空间感)
        fishes.sort((a, b) => a.depth - b.depth);

        // 渲染
        for (let fish of fishes) {
          fish.draw();
        }

        orb.draw();

        // UI 提示
        p.fill(255, 100);
        p.noStroke();
        p.textSize(14);
        p.text(`Fish Count: ${FISH_COUNT} | FlushOut: ${flushOut ? 'ON' : 'OFF'}`, 20, 30);
      };

      p.windowResized = () => {
        p.resizeCanvas(p.windowWidth, p.windowHeight);
      };
    };

    const p5Instance = new p5(sketch, containerRef.current);

    return () => {
      p5Instance.remove();
    };
  }, []);

  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100vw', 
        height: '100vh', 
        overflow: 'hidden',
        backgroundColor: BG_COLOR 
      }} 
    />
  );
}
