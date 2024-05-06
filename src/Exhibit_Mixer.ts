
type EMX_MARKER_DIRECTION = 'none' | 'next' | 'prev';

interface EMX_MARKER_DATA {
    [key: string]: {
        last_angle: number;
        last_frames: number[];  
        last_direction: string;
        timestamp: Date;        
    }
}
interface EMX_QUARTERS_DATA {
    [key: string]: string[]
}
interface EMX_QUARTER_CURRENTS {
    [key: string]: number[]
}
interface EMX_DATA_RETURN {
        angle: number;
        frame: number; 
        delta: number;
        direction: EMX_MARKER_DIRECTION
}

interface EMX_ROLLS_DATA {
    [key: string]: {
        handle: JQuery<HTMLElement>;
        label: JQuery<HTMLElement>;
    }
}
interface THREE_QUATERNION {
    x:number; y:number; z:number; w:number;
}
interface THREE_GROUP {
    name:string; quaternion:THREE_QUATERNION;
}


/**
 * --------------------------------------------------------------------------------
 * ПЕРЕВОДИТ ИНФОРМАЦИЮ О ПОЛОЖЕНИИ МАРКЕРОВ В ПРОСТРАНСТВЕ В НОМЕР КАДРА АНИМАЦИИ
 * --------------------------------------------------------------------------------
 * Получает на вход:
 * - ar-маркер (THREE_GROUP объект с выставленным положением в пространстве)
 * - количество кадров (TF, TOTAL_FRAMES) в анимации, которой нужно управлять
 *   (default=360)
 * - количество оборотов маркера (TR, TOTAL_ROUNDS), 
 *   необходимых для прохода 100% анимации (default=1)
 * --------------------------------------------------------------------------------
 * Создает информационный роллер (Roll) под каждый маркер;
 * - вычисляет угол наклона маркера вокруг одной оси (от -180 до 0 до 180) deg
 * - преобразует 180deg и -180deg в 360deg
 * - вычисляет количество прокрученных оборотов (R, ROUNDS)
 * - показывает информацию о положении маркеров в демо режиме (demoMode=true);
 * ---------------------------------------------------------------------------
 * Возвращает номер кадра,
 * - соответствующий углу поворота маркера
 * - с учетом количества сделанных полных оборотов маркера
 * -----------------------------------------------------------------------------
 * При кол-ве кадров 360 (по умолчанию), угол в 90 градусов будет равен кадру 90, 
 * т.к. 90 / (360/360) = 90;
 * При кол-ве кадров 120, угол в 90 градусов будет равен кадру 30, 
 * т.к. 90 / (360/120) = 30;
 * При кол-ве кадров 120, установленном TR = 2, 
 * угол 90 + 360 градусов (полный дополнительный оборот),
 * вернет номер кадра 150,
 * т.к 90 / (360/120) + 360 / (360/120) = 30 + 120 = 150
 * 
 */

export class Exhibit_Mixer extends EventTarget{
    
    demoMode: boolean = true;
    $container:JQuery<HTMLElement> | null = null;
    $info_panel:JQuery<HTMLElement> | null = null;    
    $tpmlRoll:JQuery<HTMLElement> | null = null;
    data:EMX_MARKER_DATA = {};
    rolls:EMX_ROLLS_DATA = {};
    total_rounds:number|undefined;
    total_frames:number|undefined;
    quarters:EMX_QUARTERS_DATA = {};    
    current_quarter:EMX_QUARTER_CURRENTS = {};

    constructor(demoMode=true) {
        super();
        this.demoMode && this.init_rolls();        
    }  

    update(arMarker:THREE_GROUP, total_frames = 360, total_rounds = 1){

        let marker_name = arMarker.name; 
        this.total_rounds = total_rounds;
        this.total_frames = total_frames;
        let angle = this.calc_angle_from_quaterion(arMarker.quaternion); 
        let ang = this.recalc_180_to_360(angle);
        this.recalc_quarters(marker_name, total_rounds);
        // this.set_quarter_current(marker_name, ang);

        let frame:number = this.calc_frame(ang, total_frames);
        let m = this.data[marker_name];
        let timeDelta:number; 
        let direction: EMX_MARKER_DIRECTION = 'none';
        if(!m){       
            this.data[marker_name] = {
                last_angle: ang,
                // сохраняем последние два фрейма, чтобы
                // позже отфильтровать повторение значений 
                // и убрать эффект дрожания.. 10,11,10,11,10,11 ...
                last_frames: [frame,frame],
                last_direction: 'none',
                timestamp: new Date(),
            } 
            this.add_roll(marker_name);
        }else{
            if(m.last_angle === ang || m.last_frames.includes(frame)){
                return;
            }else if(m.last_angle < ang){
                direction = 'next';
            }else{                
                direction = 'prev';                
            }

            let now = new Date();
            timeDelta = now.getTime() - m.timestamp.getTime();
            
            m.last_angle = ang;
            m.last_frames.shift();
            m.last_frames.push(frame);
            m.last_direction = direction;
            m.timestamp = new Date();
            
            let detail:EMX_DATA_RETURN = {
                angle:ang, 
                frame:frame, 
                delta: timeDelta, 
                direction: direction
            }    

            this.demoMode && this.update_roll(marker_name, detail);
            this.dispatchEvent(new CustomEvent('exhibit_changed_frame',{detail:detail}));
            
        }        
    }

    calc_frame(angle:number, total_frames:number):number{
        let frame = Math.round(total_frames/360*angle);
        return frame;
    }

    init_rolls(): void{
        this.$info_panel = $('#info_panel');
        this.$container = $('#exhibit-mixer-panel');
        this.$tpmlRoll = $('#exhibit-mixer-templates .roll');
    }

    add_roll(marker_name: string): JQuery<HTMLElement> | null{   
        console.log(`adding roll for: ${marker_name}`);
        if(!this.$tpmlRoll || !this.$container) return null;
        let $el = this.$tpmlRoll.clone();
        let $roll_handle = $el.find('.roll-handle');
        $roll_handle.html(`<span>${marker_name}</span>`);
        let $roll_label = $el.find('.roll-label');
        this.$container.append($el);
        this.rolls[marker_name] = {handle:$roll_handle, label:$roll_label};
        return $el;
    }

    update_roll(marker_name: string, detail:EMX_DATA_RETURN ):void{
        let roll = this.rolls[marker_name]; 
        let info = `
		${detail.direction}: 
			<br> угол: ${detail.angle},
            <br> frame: ${detail.frame}
			<br> время: ${detail.delta}
		`;
        roll.handle.css({transform:`rotateZ(${detail.angle}deg)`});                
        roll.label.html(info);
    }

    recalc_quarters(marker_name: string, total_rounds:number){
        // четвертинки круга для вычисления полных оборотов маркера
        if(!this.quarters[marker_name]){
            this.quarters[marker_name] = [];
            for(let i=0;i<total_rounds; i++){
                this.quarters[marker_name].concat(['A','B','C','D']);                
            }
        }
    }

    calc_angle_from_quaterion(q:THREE_QUATERNION):number {
	    let {x,y,z} = this.getAxisAndAngelFromQuaternion(q).axis;
	    let invert = x<0 || y<0 || z<0;
	    let angle_sign = invert?-1:1;
	    let angle = Math.abs(x)*180*angle_sign;		   
        if(this.$info_panel){
            this.$info_panel.html(this.get_info([{name:'marker-1',x,y,z}])); 
        }
        return angle;
    }

    getAxisAndAngelFromQuaternion(q:THREE_QUATERNION) {
        const angle = 2 * Math.acos(q.w);
        var s;
        if (1 - q.w * q.w < 0.000001) {
          // test to avoid divide by zero, s is always positive due to sqrt
          // if s close to zero then direction of axis not important
          // http://www.euclideanspace.com/maths/geometry/rotations/conversions/quaternionToAngle/
          s = 1;
        } else { 
          s = Math.sqrt(1 - q.w * q.w);
        }
        return { axis: {x:q.x/s, y:q.y/s, z:q.z/s}, angle };
      }    

      recalc_180_to_360(angle:number): number{
        let ang = parseInt(angle.toFixed(), 10); 
        if(ang<0) ang = 360+ang;        
        return ang;
      }

      get_info(data:{name:string;x:number;y:number;z:number}[]){
        let infoAll = "";
        const n = 2;
        for(let i in data){
            let d = data[i];
            let x = d.x;
            let y = d.y;
            let z = d.z;
            infoAll += `
            ${d.name} =			
            <br> rX: ${x.toFixed(2)}, rY: ${y.toFixed(2)}, rZ: ${z.toFixed(2)}
            <br> ------- <br>`;	
        }	
        return infoAll??"info panel";
    }
    


}