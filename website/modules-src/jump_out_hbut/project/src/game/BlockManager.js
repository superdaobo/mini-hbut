import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export default class BlockManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.blocks = [];
        this.currentBlock = null;
        this.nextBlock = null;
        
        this.textureLoader = new THREE.TextureLoader();

        // Poly Haven (CC0) 贴图 + 自绘叠加
        this.themeSources = [
            {
                name: '教学楼',
                wallUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg',
                roofUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_diff_1k.jpg',
                label: '湖工大',
                subLabel: '教学楼',
                accent: '#1e3a8a'
            },
            {
                name: '图书馆',
                wallUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_004/concrete_wall_004_diff_1k.jpg',
                roofUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_diff_1k.jpg',
                label: 'HBUT',
                subLabel: 'Library',
                accent: '#0f766e'
            },
            {
                name: '体育馆',
                wallUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/brick_wall_001/brick_wall_001_diffuse_1k.jpg',
                roofUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_diff_1k.jpg',
                label: '体育馆',
                subLabel: 'Gym',
                accent: '#b45309'
            },
            {
                name: '教学楼-现代',
                wallUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_wall_004/concrete_wall_004_diff_1k.jpg',
                roofUrl: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/roof_tiles/roof_tiles_diff_1k.jpg',
                label: 'HBUT',
                subLabel: 'Campus',
                accent: '#6b7280'
            }
        ];

        this.themes = this.themeSources.map((theme) => ({
            name: theme.name,
            wall: this.createLabeledTexture(theme.wallUrl, theme.label, theme.subLabel, theme.accent),
            roof: this.createLabeledTexture(theme.roofUrl, theme.label, theme.subLabel, theme.accent)
        }));
    }

    createLabeledTexture(baseUrl, text, subtext, accentColor) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#8c8c8c';
        ctx.fillRect(0, 0, 512, 512);

        // 默认窗口网格（即使图片未加载也有纹理细节）
        this.drawWindowGrid(ctx, 'rgba(255,255,255,0.18)');

        // 叠加校内标识
        this.drawSignage(ctx, text, subtext, accentColor);

        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            ctx.globalAlpha = 1;
            ctx.drawImage(img, 0, 0, 512, 512);

            // 添加轻微的明暗渐变
            const gradient = ctx.createLinearGradient(0, 0, 512, 512);
            gradient.addColorStop(0, 'rgba(255,255,255,0.08)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.12)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 512, 512);

            // 窗口网格和校标
            this.drawWindowGrid(ctx, 'rgba(255,255,255,0.22)');
            this.drawSignage(ctx, text, subtext, accentColor);

            texture.needsUpdate = true;
        };
        img.src = baseUrl;

        return texture;
    }

    drawWindowGrid(ctx, color) {
        ctx.fillStyle = color;
        const padding = 30;
        const cell = 40;
        const gap = 10;
        for (let y = padding; y < 512 - padding; y += cell + gap) {
            for (let x = padding; x < 512 - padding; x += cell + gap) {
                ctx.fillRect(x, y, cell, cell * 0.6);
            }
        }
    }

    drawSignage(ctx, text, subtext, accentColor) {
        ctx.save();
        ctx.fillStyle = accentColor;
        ctx.fillRect(40, 380, 432, 80);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 36px "Microsoft YaHei", sans-serif';
        ctx.fillText(text, 256, 405);
        ctx.font = '24px "Microsoft YaHei", sans-serif';
        ctx.fillText(subtext, 256, 440);
        ctx.restore();
    }

    createMaterialSet(theme, size) {
        const wallMap = theme.wall.clone();
        const roofMap = theme.roof.clone();

        wallMap.colorSpace = THREE.SRGBColorSpace;
        roofMap.colorSpace = THREE.SRGBColorSpace;
        wallMap.wrapS = wallMap.wrapT = THREE.RepeatWrapping;
        roofMap.wrapS = roofMap.wrapT = THREE.RepeatWrapping;

        const repeatFactor = Math.max(1, Math.round(size / 1.6));
        wallMap.repeat.set(repeatFactor, repeatFactor);
        roofMap.repeat.set(repeatFactor, repeatFactor);

        const side = new THREE.MeshStandardMaterial({ map: wallMap, roughness: 0.95, metalness: 0.0 });
        const top = new THREE.MeshStandardMaterial({ map: roofMap, roughness: 0.9, metalness: 0.0 });
        const bottom = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 1.0 });

        return [side, side, top, bottom, side, side];
    }

    reset() {
        // 清理所有方块
        this.blocks.forEach(b => {
            this.scene.remove(b.mesh);
            this.world.removeBody(b.body);
        });
        this.blocks = [];

        // 生成第一个平台 (起点)
        this.currentBlock = this.createBlock(0, 0, 0, 4);
        
        // 生成下一个平台
        this.generateNextBlock();
    }

    createBlock(x, y, z, size) {
        const height = size;
        
        const theme = this.themes[Math.floor(Math.random() * this.themes.length)];
        const materials = this.createMaterialSet(theme, size);
        
        // 视觉体
        const geo = new THREE.BoxGeometry(size, height, size);
        const mesh = new THREE.Mesh(geo, materials);
        mesh.position.set(x, y - height / 2, z); // 表面始终在 y=0
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.scene.add(mesh);

        // 物理体
        const shape = new CANNON.Box(new CANNON.Vec3(size/2, height/2, size/2));
        const body = new CANNON.Body({
            mass: 0, // 静态刚体
            position: new CANNON.Vec3(x, y - height / 2, z),
            material: new CANNON.Material({ friction: 0.3, restitution: 0.0 })
        });
        body.addShape(shape);
        this.world.addBody(body);

        const block = { mesh, body, size, x, z };
        this.blocks.push(block);
        return block;
    }

    generateNextBlock() {
        // 随机方向 (只有 +x 或 +z)
        const isX = Math.random() > 0.5;
        // 距离 4.5 到 8.5
        const distance = 4.5 + Math.random() * 4;
        // 尺寸 1.6 到 3.2
        const nextSize = 1.6 + Math.random() * 1.6;

        let nx = this.currentBlock.x;
        let nz = this.currentBlock.z;

        if (isX) {
            nx += distance;
        } else {
            nz += distance;
        }

        this.nextBlock = this.createBlock(nx, 0, nz, nextSize);
        return { isX, distance, nx, nz };
    }

    stepToNext() {
        this.currentBlock = this.nextBlock;
        this.generateNextBlock();
    }
}
