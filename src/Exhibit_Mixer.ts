
type EMX_MARKER_DIRECTION = 'none' | 'next' | 'prev';

interface EMX_MARKER_DATA {
    last_angle: number;
    last_frames: number[];  
    last_direction: string;
    timestamp: Date;       
}
interface EMX_DATA_RETURN {
    angle: number;
    frame: number; 
    delta: number;
    direction: EMX_MARKER_DIRECTION
}
interface EMX_ROLL_DATA {        
    handle: JQuery<HTMLElement>|null;
    info: JQuery<HTMLElement>|null;
}
interface EMX_AXIS_DATA {
    x:number; y:number; z:number;
}
interface THREE_QUATERNION {
    x:number; y:number; z:number; w:number;
}
interface THREE_GROUP {
    name:string; quaternion:THREE_QUATERNION;
}
type QUARTER = 'A'|'B'|'C'|'D';

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
 * ----------------------------------------------------------------------------------------
 * Настройка камеры. Необходимо поставить камеру приблизительно под углом ~45deg к маркеру.
 * Для более точной настройки следить за значением оси rX. 
 * При повороте маркера на 90deg, rX должна ровняться 0.50. 
 * -------------------------------------------------------------------------------------
 * Соотношения осей кX,кY,кZ (вычесленных из кватериона) и положения маркера в градусах:
 * маркер = 0deg, rX = 0;
 * маркер = 180deg, rX = 1;
 * маркер = 90deg, rX = 0.50 или -0.50, при этом (rY и rX) положительные значения;
 * маркер = 270deg, rX = 0.50 или -0.50, при этом (rY или rX) отрицательные значения;
 */

export class Exhibit_Mixer extends EventTarget{
        
    arMarker:THREE_GROUP;    
    $container:JQuery<HTMLElement> | null = null;    
    $tpmlRoll:JQuery<HTMLElement> | null = null;
    data:EMX_MARKER_DATA|null = null;
    roll:EMX_ROLL_DATA = {
        handle: null,
        info: null
    };    
    
    total_rounds:number;
    total_frames:number;    
    quarters:QUARTER[] = [];        
    quarter_sign = 1;
    current_quarter:QUARTER|undefined;
    current_angle = 0;
    current_round = 1;
    
    last_axis_value:EMX_AXIS_DATA|null = null; 
    demoMode: boolean = true;

    constructor(arMarker:THREE_GROUP, total_frames = 360, total_rounds = 1, demoMode = true) {
        super();
        this.arMarker = arMarker; 
        this.total_rounds = total_rounds;
        this.total_frames = total_frames;
        this.demoMode = demoMode;
        demoMode && this.init_roll();
    }  

    update(){
        
        let angle = this.calc_angle_from_quaterion(this.arMarker.quaternion); 
        let ang = this.recalc_180_to_360(angle);                                
        this.update_current_values(ang);
        this.check_all_quarters();
        this.current_round = this.calc_round();

        let frame:number = this.calc_frame(ang, this.total_frames);
        let m = this.data;
        let timeDelta:number; 
        let direction: EMX_MARKER_DIRECTION = 'none';
        
        if(!m){       
            this.data = {
                last_angle: ang,
                // сохраняем последние два фрейма, чтобы
                // позже отфильтровать повторение значений 
                // и убрать эффект дрожания.. 10,11,10,11,10,11 ...
                last_frames: [frame,frame],
                last_direction: 'none',
                timestamp: new Date(),
            }             
            this.add_roll(this.arMarker.name);
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

            this.demoMode && this.update_roll(detail);
            this.dispatchEvent(new CustomEvent('exhibit_changed_frame',{detail:detail}));
            
        }        
    }

    calc_frame(angle:number, total_frames:number):number{
        let frame = Math.round(total_frames/360*angle);
        return frame;
    }

    init_roll(): void{        
        this.$container = $('#exhibit-mixer-panel');        
        this.$tpmlRoll = $(`<div class="roll">				
        <div class="roll-handle"><span>Marker-1</span></div>	
        <div class="roll-info"></div>	
        </div>`);
    }

    add_roll(marker_name: string): JQuery<HTMLElement> | null{   
        console.log('add_roll',marker_name)
        console.log(`adding roll for: ${marker_name}`);
        if(!this.$tpmlRoll || !this.$container) return null;
        let $el = this.$tpmlRoll.clone();
        let $roll_handle = $el.find('.roll-handle');
        $roll_handle.html(`<span>${marker_name}</span>`);
        let $roll_info = $el.find('.roll-info');
        this.$container.append($el);
        this.roll = {handle:$roll_handle, info:$roll_info};
        return $el;
    }

    update_roll(detail:EMX_DATA_RETURN ):void{
        let roll = this.roll; 

        let axies_info = '';        
        if(this.last_axis_value){
            let X = this.last_axis_value.x.toFixed(2);
            let Y = this.last_axis_value.y.toFixed(2);
            let Z = this.last_axis_value.z.toFixed(2);
            axies_info=`<hr>rX, rY, rZ:<br>${X}&nbsp;/&nbsp;${Y}&nbsp;/&nbsp;${Z}`;
        }

        let sign = this.quarter_sign>0?'':'-';
        let round_info = `
           <hr> round: ${sign} ${this.current_round}
        `;
        
        let info = `
		${detail.direction}: 
			<br> угол: ${detail.angle},
            <br> frame: ${detail.frame}
			<br> время: ${detail.delta}            
            ${round_info}
            ${axies_info}
		`;
        roll.handle && roll.handle.css({transform:`rotateZ(${detail.angle}deg)`});                
        roll.info && roll.info.html(info);
    }

    calc_round():number{
        let qs = this.quarters;        
        let Q = this.quarter_sign>0?'A':'D';
        let arr = this.quarters.filter(i=>i===Q);        
        return arr.length;
    }

    update_current_values(angle:number):void {        
        // принимает угол 0-359
        // 1. обновляет информацию о текущем значении угла
        // 2. обновляет информацию о положении маркера относительно четвертинок круга;
        // 3. обновляет номер раунда
        if (angle === this.current_angle){  return; }
        
        this.current_angle=angle;        
        let new_quarter:QUARTER;

        if(angle>-1 && angle<90){
            new_quarter = 'A';
        }else if(angle>89 && angle<180){
            new_quarter = 'B';
        }else if(angle>179 && angle<270){
            new_quarter = 'C';
        }else {
            new_quarter = 'D';
        } 
        
        if(!this.current_quarter || new_quarter!==this.current_quarter){
            this.current_quarter = new_quarter;

            if(!this.quarters.length){
                this.init_quarters_with(new_quarter);
                this.update_current_quarter(new_quarter);
                return;
            }
            
            // catch some errors
            if(this.quarters[0]!=='A' && this.quarters[0]!=='D'){
                this.restart_quarters(new_quarter);
                return;
            }
            if(this.quarters[0]=='A' && this.quarter_sign<0){
                this.restart_quarters(new_quarter);
                return;
            }
            if(this.quarters[0]=='D' && this.quarter_sign>0){
                this.restart_quarters(new_quarter);
                return;
            }            

            if(this.quarter_sign>0){

                if(this.quarters.length==1){
                    if(new_quarter==='D'){
                        // go back and change sign
                        this.quarters.pop();
                        this.quarters.push(new_quarter);
                        this.quarter_sign = -1;
                    }else if(new_quarter==='B'){
                        // go front
                        this.quarters.push(new_quarter);
                    }
                    this.update_current_quarter(new_quarter);
                    return;
                }
    
                if(this.quarters.length>1){
                    let prev = this.quarters.length-2;                
                    if(this.quarters[prev]===new_quarter){
                        // go back
                        this.quarters.pop();
                    }else{
                        // go front
                        this.quarters.push(new_quarter);
                    }
                    this.update_current_quarter(new_quarter);
                    return;                
                }
                
            }else{

                if(this.quarters.length==1){
                    if(new_quarter==='A'){
                        // go front and change sign
                        this.quarters.pop();
                        this.quarters.push(new_quarter);
                        this.quarter_sign = 1;
                    }else if(new_quarter==='C'){
                        // go back
                        this.quarters.push(new_quarter);
                    }
                    this.update_current_quarter(new_quarter);
                    return;
                }                
                
                if(this.quarters.length>1){
                    let prev = this.quarters.length-2;                
                    if(this.quarters[prev]===new_quarter){
                        // go front
                        this.quarters.pop();
                    }else{
                        // go back
                        this.quarters.push(new_quarter);
                    }
                    this.update_current_quarter(new_quarter);
                    return;                
                }

            }
        
        }
        
    }

    check_all_quarters():void{
        // todo
        // проверить последовательность четвертинок
        // и, если что не так – сбросить 
    }

    restart_quarters(q:QUARTER){
        this.quarters = [];
        this.init_quarters_with(q);
        this.update_current_quarter(q);     
        console.log('quarters restarted')
    }

    update_current_quarter(q:QUARTER){
        this.current_quarter = q;
        console.log(this.quarters)
    }

    init_quarters_with(q:QUARTER){
        let str:QUARTER[] = ['A','B','C','D'];
        let count = str.indexOf(q);
        for(let i = 0; i<count+1; i++){
            this.quarters.push(str[i]);
        }        
        this.current_round = 1;
        this.quarter_sign = 1;        
    }

    search_pos(quarter:QUARTER, curpos:number):number{    
        
        console.log('quarter, curpos',quarter, curpos)

        // let newpos:number;
        let newpos = curpos;

        // let next_pos = curpos+1 < this.quarters.length?curpos+1:0;
        // let prev_pos = curpos > 0? curpos--: this.quarters.length-1;

        // console.log('prev_pos, curpos(quarter), next_pos',prev_pos, `${curpos}(${quarter})`, next_pos)
        // console.log(this.quarters)

        // if(this.quarters[next_pos]===quarter){                        
        //     newpos = next_pos;            
        // }else if(this.quarters[prev_pos]===quarter){            
        //     newpos = prev_pos;            
        // }else{            
        //     newpos = ['A','B','C','D'].indexOf(quarter);            
        //     console.log('def')
        // }
        return newpos;
    }

    get_next_quarter(pos: number):{quarter:QUARTER, pos:number}{
        let next_pos = pos;
        if(next_pos > this.quarters.length-1){ next_pos = 0 }                
        let quarter = this.quarters[next_pos];
        return {quarter:quarter, pos:next_pos};
    }

    get_prev_quarter(pos: number):{quarter:QUARTER, pos:number}{
        let prev_pos = pos;
        if (prev_pos<0){ prev_pos = this.quarters.length-1}        
        let quarter = this.quarters[prev_pos];
        return {quarter:quarter, pos:prev_pos};
    }

    calc_angle_from_quaterion(q:THREE_QUATERNION):number {
	    let {x,y,z} = this.getAxisAndAngelFromQuaternion(q).axis;
	    let invert = x<0 || y<0 || z<0;
	    let angle_sign = invert?-1:1;
	    let angle = Math.abs(x)*180*angle_sign;	
        this.last_axis_value = {x,y,z};
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
        return Math.abs(ang);
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