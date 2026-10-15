#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include "mus.h"
static void callback(void *ctx,const mus_event *ev) {(void)ctx;(void)ev;}
int main(int argc,char **argv){
 uint8_t *data=calloc(17,1);
 memcpy(data,"MUS\x1a",4);data[4]=1;data[6]=16;
 data[16]=argc>1?0x60:0x10;
 mus_sequencer seq;
 if(mus_sequencer_init(&seq,data,17)!=MUS_OK)return 2;
 mus_sequencer_advance(&seq,1,argc>1,callback,0);
 free(data);return 0;
}
