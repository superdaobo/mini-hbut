import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import gsap from 'gsap';

export default class Player {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        
        // 游戏相关参数
        this.chargeAmount = 0;
        this.isCharging = false;
        
        this.initVisuals();
        this.initPhysics();
        this.reset();
    }

    initVisuals() {
        // 主角模型：下半球+圆柱+小球头 (类i形)
        this.mesh = new THREE.Group();

        // 底部
        const baseGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.2, 32);
        const mat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
        
        this.bodyMesh = new THREE.Mesh(baseGeo, mat);
        this.bodyMesh.position.y = 0.6;
        this.bodyMesh.castShadow = true;
        this.bodyMesh.receiveShadow = true;
        
        // 头部
        const headGeo = new THREE.SphereGeometry(0.4, 32, 32);
        this.headMesh = new THREE.Mesh(headGeo, mat);
        this.headMesh.position.y = 1.4;
        this.headMesh.castShadow = true;

        this.mesh.add(this.bodyMesh);
        this.mesh.add(this.headMesh);
        this.scene.add(this.mesh);
    }

    initPhysics() {
        // 创建物理刚体
        const shape = new CANNON.Cylinder(0.4, 0.4, 1.5, 16);
        // CANNON 的 Cylinder 默认沿着 Z 轴，需要旋转使其沿着 Y 轴
        const quat = new CANNON.Quaternion();
        quat.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);

        this.body = new CANNON.Body({
            mass: 5,
            position: new CANNON.Vec3(0, 5, 0),
            material: new CANNON.Material({ friction: 10, restitution: 0.1 }),
            linearDamping: 0.2,
            angularDamping: 0.9,
        });

        // 将形状旋转后添加到 Body
        this.body.addShape(shape, new CANNON.Vec3(0, 0, 0), quat);

        // 固定旋转，防止跳跃后随意侧翻
        this.body.fixedRotation = true;
        this.body.angularFactor.set(0, 0, 0);
        this.body.updateMassProperties();

        // 为防止无限侧翻，可以锁定旋转，只有跳跃时允许特定的旋转？跳一跳允许侧翻
        this.world.addBody(this.body);
    }

    reset() {
        this.body.position.set(0, 5, 0); // 初始掉落位置
        this.body.velocity.set(0, 0, 0);
        this.body.angularVelocity.set(0, 0, 0);
        this.body.quaternion.set(0, 0, 0, 1);
        
        this.chargeAmount = 0;
        this.isCharging = false;
        
        this.scaleY = 1.0;
        this.headMesh.position.y = 1.4;
        this.bodyMesh.scale.y = 1.0;
        
        this.updateVisuals();
    }

    startCharge() {
        // 防止空中蓄力：允许轻微抖动
        if (Math.abs(this.body.velocity.y) > 0.5) return false;
        if (this.body.position.y > 1.6) return false;
        this.isCharging = true;
        this.body.velocity.set(0, 0, 0);
        return true;
    }

    charge(deltaTime) {
        if (!this.isCharging) return;
        
        this.chargeAmount += deltaTime * 3.0; // 蓄力速度
        if (this.chargeAmount > 3.2) this.chargeAmount = 3.2; // 最大蓄力值
        
        // 视觉形变
        const compressRatio = 1 - (this.chargeAmount / 3.2) * 0.4; // 最多压缩40%
        this.bodyMesh.scale.y = compressRatio;
        this.bodyMesh.position.y = 0.6 * compressRatio;
        this.headMesh.position.y = 1.2 * compressRatio + 0.2;
    }

    jump(direction) {
        if (!this.isCharging) return;
        this.isCharging = false;

        // 恢复视觉形变 (使用 gsap 弹簧效果)
        gsap.to(this.bodyMesh.scale, { y: 1, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
        gsap.to(this.bodyMesh.position, { y: 0.6, duration: 0.3, ease: 'elastic.out(1, 0.3)' });
        gsap.to(this.headMesh.position, { y: 1.4, duration: 0.3, ease: 'elastic.out(1, 0.3)' });

        // 计算冲力
        // direction 应该是单位向量，指向下一个方块
        const charge = Math.max(this.chargeAmount, 0.2);
        const forceMultiplier = 26;
        const upForce = 36 + charge * 16;
        const forwardForce = (charge + 0.25) * forceMultiplier;

        const impulse = new CANNON.Vec3(
            direction.x * forwardForce,
            upForce,
            direction.z * forwardForce
        );

        // 施加在刚体质心稍下方，产生前空翻的效果
        const point = new CANNON.Vec3(
            this.body.position.x, 
            this.body.position.y - 0.5, 
            this.body.position.z
        );

        this.body.applyImpulse(impulse, point);
        
        this.chargeAmount = 0;
    }

    updateVisuals() {
        this.mesh.position.copy(this.body.position);
        this.mesh.quaternion.copy(this.body.quaternion);
    }
}
