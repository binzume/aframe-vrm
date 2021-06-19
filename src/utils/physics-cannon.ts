export class VRMPhysicsCannonJS implements VRMModule {
    collisionGroup = 2;
    enable = false;
    binds: [THREE.Object3D, CANNON.Body][] = [];
    fixedBinds: [THREE.Object3D, CANNON.Body][] = [];
    bodies: CANNON.Body[] = [];
    constraints: any[] = [];
    private readonly _tmpQ0 = new THREE.Quaternion();
    private readonly _tmpV0 = new THREE.Vector3();
    private readonly _tmpV1 = new THREE.Vector3();
    springBoneSystem: any;
    world: CANNON.World | null = null;
    internalWorld: boolean = false;
    constructor(initctx: InitCtx) {
        this.springBoneSystem = this._springBoneSystem();
        this._init(initctx);
    }
    private _init(initctx: InitCtx): void {
        if (!initctx.vrm.secondaryAnimation) {
            return;
        }
        let nodes = initctx.nodes;
        let secondaryAnimation = initctx.vrm.secondaryAnimation;
        let allColliderGroupsMask = 0;
        let colliderMarginFactor = 0.9; // TODO: Remove this.
        (secondaryAnimation.colliderGroups || []).forEach((cc, i) => {
            let node = nodes[cc.node];
            for (let collider of cc.colliders) {
                let body = new CANNON.Body({ mass: 0, collisionFilterGroup: 1 << (this.collisionGroup + i + 1), collisionFilterMask: -1 });
                body.addShape(new CANNON.Sphere(collider.radius * colliderMarginFactor), collider.offset);
                this.bodies.push(body);
                this.fixedBinds.push([node, body]);
                allColliderGroupsMask |= body.collisionFilterGroup;
            }
        });
        for (let bg of secondaryAnimation.boneGroups || []) {
            let gravity = new CANNON.Vec3().copy(bg.gravityDir || { x: 0, y: -1, z: 0 }).scale(bg.gravityPower || 0);
            let radius = bg.hitRadius || 0.05;
            let collisionFilterMask = ~(this.collisionGroup | allColliderGroupsMask);
            for (let g of bg.colliderGroups || []) {
                collisionFilterMask |= 1 << (this.collisionGroup + g + 1);
            }
            for (let b of bg.bones) {
                let root = new CANNON.Body({ mass: 0, collisionFilterGroup: 0, collisionFilterMask: 0 });
                root.position.copy(nodes[b].parent.getWorldPosition(this._tmpV0));
                this.bodies.push(root);
                this.fixedBinds.push([nodes[b].parent, root]);
                let add = (parentBody: CANNON.Body, node: THREE.Object3D) => {
                    let c = node.getWorldPosition(this._tmpV0);
                    let wpos = c.clone(); // TODO
                    let n = node.children.length + 1;
                    if (node.children.length > 0) {
                        node.children.forEach(n => {
                            c.add(n.getWorldPosition(this._tmpV1));
                        });
                    } else {
                        c.add(node.parent!.getWorldPosition(this._tmpV1).sub(c).normalize().multiplyScalar(-0.1).add(c));
                        n = 2;
                    }
                    c.multiplyScalar(1 / n);

                    let body = new CANNON.Body({
                        mass: 0.5,
                        linearDamping: Math.max(bg.dragForce || 0, 0.0001),
                        angularDamping: Math.max(bg.dragForce || 0, 0.0001),
                        collisionFilterGroup: this.collisionGroup,
                        collisionFilterMask: collisionFilterMask,
                        position: new CANNON.Vec3().copy(c),
                    });
                    body.addShape(new CANNON.Sphere(radius));
                    this.bodies.push(body);

                    let o = new CANNON.Vec3().copy(this._tmpV1.copy(wpos).sub(c));
                    let d = new CANNON.Vec3().copy(wpos.sub(parentBody.position));
                    let joint = new CANNON.PointToPointConstraint(body, o, parentBody, d);
                    this.constraints.push(joint);

                    this.binds.push([node, body]);
                    this.springBoneSystem.objects.push({ body: body, parentBody: parentBody, force: gravity, boneGroup: bg, size: radius });
                    node.children.forEach(n => (n as THREE.Bone).isBone && add(body, n));
                };
                add(root, nodes[b]);
            }
        }
    }
    private _springBoneSystem() {
        let _q0 = new CANNON.Quaternion();
        let _q1 = new CANNON.Quaternion();
        let _v0 = new CANNON.Vec3();
        return {
            world: null as CANNON.World | null,
            objects: [] as any[],
            update() {
                let g = this.world!.gravity, dt = this.world!.dt;
                let avlimit = 0.1;
                for (let b of this.objects) {
                    let body = b.body, parent = b.parentBody;
                    // Cancel world.gravity and apply boneGroup.gravity.
                    let f = body.force, m = body.mass, g2 = b.force;
                    f.x += m * (-g.x + g2.x);
                    f.y += m * (-g.y + g2.y);
                    f.z += m * (-g.z + g2.z);

                    // angularVelocity limitation
                    let av = body.angularVelocity.length();
                    if (av > avlimit) {
                        body.angularVelocity.scale(avlimit / av, body.angularVelocity);
                    }

                    // apply spring(?) force.
                    let stiffness = b.boneGroup.stiffiness; // stiff'i'ness
                    let approxInertia = b.size * b.size * m * 1600;
                    let rot = body.quaternion.mult(parent.quaternion.inverse(_q0), _q1);
                    let [axis, angle] = rot.toAxisAngle(_v0);
                    angle = angle - Math.PI * 2 * Math.floor((angle + Math.PI) / (Math.PI * 2));
                    let tf = angle * stiffness;
                    if (Math.abs(tf) > Math.abs(angle / dt / dt * 0.00025)) {
                        tf = angle / dt / dt * 0.00025; // TODO
                    }
                    let af = axis.scale(-tf * approxInertia, axis);
                    body.torque.vadd(af, body.torque);
                }
            }
        };
    }
    public attach(world: CANNON.World | null): void {
        this.detach();
        this.internalWorld = world == null;
        this.world = world || new CANNON.World();
        this.springBoneSystem.world = this.world;
        this.world.subsystems.push(this.springBoneSystem);
        this.bodies.forEach(b => this.world!.addBody(b));
        this.constraints.forEach(c => this.world!.addConstraint(c));
        this.reset();
        this.enable = true;
        // HACK: update collision mask.
        this.world.bodies.forEach(b => {
            if (b.collisionFilterGroup == 1 && b.collisionFilterMask == 1) {
                b.collisionFilterMask = -1;
            }
        });
    }
    public detach(): void {
        if (!this.world) {
            return;
        }
        this.world.subsystems = this.world.subsystems.filter(s => s != this.springBoneSystem);
        this.world.constraints = this.world.constraints.filter(c => !this.constraints.includes(c));
        this.world.bodies = this.world.bodies.filter(b => !this.bodies.includes(b));
        this.world = null;
        this.enable = false;
    }
    public reset(): void {
        this.fixedBinds.forEach(([node, body]) => {
            node.updateWorldMatrix(true, false);
            body.position.copy(node.getWorldPosition(this._tmpV0));
            body.quaternion.copy(node.parent!.getWorldQuaternion(this._tmpQ0));
        });
        this.binds.forEach(([node, body]) => {
            node.updateWorldMatrix(true, false);
            body.position.copy(node.getWorldPosition(this._tmpV0));
            body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
        });
    }
    public update(timeDelta: number): void {
        if (!this.enable) {
            return;
        }
        this.fixedBinds.forEach(([node, body]) => {
            body.position.copy(node.getWorldPosition(this._tmpV0));
            body.quaternion.copy(node.getWorldQuaternion(this._tmpQ0));
        });
        if (this.internalWorld) {
            this.world!.step(1 / 60, timeDelta);
        }
        this.binds.forEach(([node, body]) => {
            node.quaternion.copy(body.quaternion).premultiply(node.parent!.getWorldQuaternion(this._tmpQ0).invert());
        });
    }
    public dispose(): void {
        this.detach();
    }
}
