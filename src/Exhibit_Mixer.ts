
type EMX_MARKER_DIRECTION = 'none' | 'next' | 'prev';

interface EMX_MARKER_DATA {
    [key: string]: {
        last_angle: number;
        last_frames: number[];  
        last_direction: string;
        timestamp: Date;        
    }
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
 * ------------------------------------------------------------------------------
 * ПЕРЕВОДИТ ИНФОРМАЦИЮ О ПОЛОЖЕНИИ МАРКЕРА В ПРОСТРАНСТВЕ В НОМЕР КАДРА АНИМАЦИИ
 * ------------------------------------------------------------------------------
 * Получает на вход информацию с ar-треккера:
 *  - имя маркера
 *  - угол наклона маркера вокруг одной оси (от -180 до 0 до 180) deg
 *  - количество кадров (в анимации, которой нужно управлять)   
 * ---------------------------------------------------------------------
 * Создает информационный роллер (Roll) под каждый маркер;
 * показывает роллеры в демо режиме (demoMode=true);
 * преобразует 180deg и -180deg в 360deg
 * -------------------------------------------------
 * Возвращает номер кадра, соответствующий углу поворота маркера.
 * -----------------------------------------------------------------------------
 * При кол-ве кадров 360 (по умолчанию), угол в 90 градусов будет равен кадру 90, 
 * т.к. 90/(360/360) = 90;
 * При кол-ве кадров 120, угол в 90 градусов будет равен кадру 30, 
 * т.к. 90/(360/120) = 30;
 */

export class Exhibit_Mixer extends EventTarget{
    
    demoMode: boolean = true;
    $container:JQuery<HTMLElement> | null = null;
    $info_panel:JQuery<HTMLElement> | null = null;    
    $tpmlRoll:JQuery<HTMLElement> | null = null;
    data:EMX_MARKER_DATA = {};
    rolls:EMX_ROLLS_DATA = {};

    constructor(demoMode=true) {
        super();
        this.demoMode && this.init_rolls();        
    }  

    update(arMarker:THREE_GROUP, total_frames:number = 360){

        let marker_name = arMarker.name; 
        let angle = this.calc_angle_from_quaterion(arMarker.quaternion); 
        let ang = this.recalc_180_to_360(angle);        
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