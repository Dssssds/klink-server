import { ServiceProto } from "tsrpc-proto";
import { ReqGetServiceStatus, ResGetServiceStatus } from "./src/server/api/GetServiceStatus";
import { ReqGetKlineData, ResGetKlineData } from "./src/server/api/GetKlineData";
import { ReqGetQuoteData, ResGetQuoteData } from "./src/server/api/GetQuoteData";
export interface ServiceType {
    api: {
        GetServiceStatus: {
            req: ReqGetServiceStatus;
            res: ResGetServiceStatus;
        };
        GetKlineData: {
            req: ReqGetKlineData;
            res: ResGetKlineData;
        };
        GetQuoteData: {
            req: ReqGetQuoteData;
            res: ResGetQuoteData;
        };
    };
    msg: {};
}
export declare const serviceProto: ServiceProto<ServiceType>;
//# sourceMappingURL=tsrpc.config.d.ts.map