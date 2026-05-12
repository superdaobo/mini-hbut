import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import gsap from 'gsap';
import Player from './Player.js';
import BlockManager from './BlockManager.js';

export default class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.score = 0;
        this.status = 'ready'; // ready, charging, jumping, gameover
        
        // 外部DOM钩子
        this.onScoreChange = () => {};
        this.onGameOver = () => {};

        this.lastTime = 0;
    }

    init() {
        this.initThree();
        this.initCannon();
        
        this.blockManager = new BlockManager(this.scene, this.world);
        this.player = new Player(this.scene, this.world);
        
        this.initEvents();
        this.restart();

        this.lastTime = performance.now();
        requestAnimationFrame(this.loop.bind(this));
    }

    initThree() {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xd0e8f2); // 柔和天空蓝

        // 正交相机：宽高比例
        const aspect = window.innerWidth / window.innerHeight;
        const d = 12; // 相机视野范围
        this.camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
        this.camera.position.set(-12, 12, -12);
        this.camera.lookAt(0, 0, 0);

        // 光源
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(-10, 20, -10);
        dirLight.castShadow = true;
        // 配置阴影范围
        dirLight.shadow.camera.left = -15;
        dirLight.shadow.camera.right = 15;
        dirLight.shadow.camera.top = 15;
        dirLight.shadow.camera.bottom = -15;
        this.scene.add(dirLight);
    }

    initCannon() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -50, 0); // 跳一跳重力感较强
        
        // 基础材质用于全局物理配置
        const defaultMaterial = new CANNON.Material();
        const contactMaterial = new CANNON.ContactMaterial(defaultMaterial, defaultMaterial, {
            friction: 0.8,
            restitution: 0.1, // 略微反弹
        });
        this.world.addContactMaterial(contactMaterial);
    }

    restart() {
        this.score = 0;
        this.status = 'ready';
        this.onScoreChange(this.score);

        this.blockManager.reset();
        this.player.reset();

        // 视角归位
        this.camera.position.set(-12, 12, -12);
        this.camera.lookAt(0, 0, 0);
    }

    initEvents() {
        // PC 鼠标和移动端触摸支持
        window.addEventListener('pointerdown', this.handlePointerDown.bind(this));
        window.addEventListener('pointerup', this.handlePointerUp.bind(this));
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    handlePointerDown(e) {
        if (e.target.tagName.toLowerCase() === 'button') return; // 点击了UI
        if (this.status !== 'ready') return;
        
        const started = this.player.startCharge();
        if (!started) return;
        this.status = 'charging';
    }

    handlePointerUp() {
        if (this.status !== 'charging') return;
        if (!this.player.isCharging) {
            this.status = 'ready';
            return;
        }
        
        this.status = 'jumping';
        
        // 计算跳跃方向，指向下一个方块
        const cb = this.blockManager.currentBlock;
        const nb = this.blockManager.nextBlock;
        
        const dir = new THREE.Vector3(nb.x - cb.x, 0, nb.z - cb.z).normalize();
        this.player.jump(dir);
    }

    handleResize() {
        const aspect = window.innerWidth / window.innerHeight;
        const d = 12;
        this.camera.left = -d * aspect;
        this.camera.right = d * aspect;
        this.camera.top = d;
        this.camera.bottom = -d;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    loop(time) {
        requestAnimationFrame(this.loop.bind(this));
        
        const deltaTime = (time - this.lastTime) / 1000;
        this.lastTime = time;

        // 恒定步长更新物理
        this.world.step(1/60, deltaTime, 3);
        
        // 同步玩家状态
        this.player.updateVisuals();

        if (this.status === 'charging') {
            this.player.charge(deltaTime);
        }

        if (this.status === 'jumping') {
            // 检查是否落地或掉出边界
            if (this.player.body.velocity.y < 0.1 && this.player.body.position.y < 1.5) {
                // 等待其完全静止或掉落
                if (Math.abs(this.player.body.velocity.y) < 0.05 && this.player.body.position.y > -1) {
                    this.checkLanding();
                }
            }
            
            // 如果掉下去了
            if (this.player.body.position.y < -5) {
                this.gameOver();
            }
        }

        // 让相机跟随目前所在方块与下一方块的中点
        if (this.status !== 'gameover') {
            const cb = this.blockManager.currentBlock;
            const nb = this.blockManager.nextBlock;
            const targetX = (cb.x + nb.x) / 2;
            const targetZ = (cb.z + nb.z) / 2;

            // 缓动追随
            const currentCamX = this.camera.position.x;
            const currentCamZ = this.camera.position.z;
            
            // 目标相机位置应该是中心点加上初始偏移 (-10, 10, -10)
            const desiredCamX = targetX - 12;
            const desiredCamZ = targetZ - 12;

            this.camera.position.x += (desiredCamX - currentCamX) * 0.05;
            this.camera.position.z += (desiredCamZ - currentCamZ) * 0.05;
        }

        this.renderer.render(this.scene, this.camera);
    }

    checkLanding() {
        const px = this.player.body.position.x;
        const pz = this.player.body.position.z;
        const nb = this.blockManager.nextBlock;
        const cb = this.blockManager.currentBlock;
        
        const distX = Math.abs(px - nb.x);
        const distZ = Math.abs(pz - nb.z);

        // 如果刚好在下一个方块上
        if (distX < nb.size/2 && distZ < nb.size/2) {
            this.score++;
            this.onScoreChange(this.score);
            this.blockManager.stepToNext();
            this.status = 'ready';
        } else if (Math.abs(px - cb.x) < cb.size/2 && Math.abs(pz - cb.z) < cb.size/2) {
            // 跳太轻，还在原方块上
            this.status = 'ready';
        } else {
            // 落在边缘外，靠重力滑下
            // Do nothing, let physics handle the fall
        }
    }

    gameOver() {
        if (this.status === 'gameover') return;
        this.status = 'gameover';
        this.onGameOver(this.score);
    }
}
