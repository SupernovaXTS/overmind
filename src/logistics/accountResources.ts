import { TraderJoeIntershard } from "logistics/TradeNetwork";
import { log } from "../console/log";

// Wrapper class for managing account resources
export class accountResources {
    settings = {
        pixelAmt: 0
    }
    
    generatePixel() {
        if(Game.cpu.bucket == 10000 && Game.shard.name != "shard3" && Game.cpu.generatePixel) {
			Game.cpu.generatePixel();
			log.info("Generating Pixel...")
            return true
        }
        return false
    }
    
    buyPixel(num: number) {

    }
    sellPixel(num: number) {

    }
    handlePixel() {
        this.generatePixel()
    }
    buyCPUUnlock(num: number) {

    }
    sellCPUUnlock(num: number) {
        // We shouldn't be selling these automatically, if we do we need to keep 1-2 weeks worth avaliable for use


    }
    useCPUUnlock(num: number) {

    }
    handleCPUUnlock () {
        // handler for doing cpu unlock shit
    }
}