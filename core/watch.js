import { isType } from "../utils/index";

export function watchData(Mee){
    Mee.prototype.defineReactive = function(){

        let _mee = this;

        Object.keys(this.data).forEach(prop => {
           defineProp(this.data, prop, this.data[prop]);
        });

        function defineProp(data, prop, val) {
            if(isType(val, 'object')){
                Object.keys(val).forEach(_prop => {
                    defineProp(val, _prop, val[_prop]);
                });
            }
            else{
                Object.defineProperty(data, prop, {
                    get: function () {
                        return val;
                    },
                    set: function (newVal) {
                        val = newVal
                        _mee.reactiveCollection();
                    }
                })
            }
        }

    }

    Mee.prototype.reactiveCollection = function(){
        let _this = this;
        _this.render();
    }
}